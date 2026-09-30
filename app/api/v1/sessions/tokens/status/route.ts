import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveTokenStatus } from "@/lib/auth/token-status";

const MAX_IDS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TokenRow {
  id: string;
  expires_at: string;
  not_before: string | null;
  redeemed_at: string | null;
  revoked_at: string | null;
}

/**
 * POST /api/v1/sessions/tokens/status — `[tokens:read]` (or `tokens:write`)
 * Body: { token_ids: string[] }  (max 500)
 *
 * Lifecycle state for many tokens in one call, so an integrator can tell which
 * of a participant's tokens lapsed unused — and may be replaced — without
 * polling GET /sessions/tokens/{id} once per token.
 *
 * POST rather than GET only because 500 UUIDs overflow a URL; it reads nothing
 * but the caller's own org. Unknown ids — including another org's — are
 * reported in `not_found`, never leaked.
 */
export async function POST(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/unauthorized", title: "Unauthorized", status: 401, detail: "Missing, malformed, revoked or expired API key." },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("tokens:read") && !ctx.scopes.includes("tokens:write")) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/forbidden", title: "Forbidden", status: 403, detail: "API key lacks tokens:read scope." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null) as { token_ids?: unknown } | null;
  const ids = body?.token_ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === "string")) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/validation", title: "Validation failed", status: 400, detail: "token_ids must be a non-empty array of strings." },
      { status: 400 }
    );
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/validation", title: "Validation failed", status: 400, detail: `At most ${MAX_IDS} token_ids per request.` },
      { status: 400 }
    );
  }

  const wanted = [...new Set(ids as string[])];
  // Malformed ids can never match a uuid column; answer them as not_found
  // rather than letting Postgres reject the whole query.
  const valid = wanted.filter((id) => UUID.test(id));

  const supabase = createAdminClient();
  const { data, error } = valid.length === 0
    ? { data: [], error: null }
    : await supabase
        .from("session_tokens")
        .select("id, expires_at, not_before, redeemed_at, revoked_at")
        .eq("org_id", ctx.orgId)
        .in("id", valid);

  if (error) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/internal", title: "Lookup failed", status: 500, detail: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as unknown as TokenRow[];
  const now = new Date();
  const found = new Set(rows.map((r) => r.id));

  return NextResponse.json({
    checked_at: now.toISOString(),
    data: rows.map((t) => {
      const status = deriveTokenStatus(t, now);
      return {
        token_id:       t.id,
        status,
        expired_unused: status === "expired",
        expires_at:     t.expires_at,
        redeemed_at:    t.redeemed_at,
        revoked_at:     t.revoked_at,
      };
    }),
    not_found: wanted.filter((id) => !found.has(id)),
  });
}
