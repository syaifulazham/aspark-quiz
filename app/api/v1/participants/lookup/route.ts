import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

const LOOKUP_FIELDS = ["personal_id", "external_ref", "email"] as const;
type LookupField = (typeof LOOKUP_FIELDS)[number];

const PARTICIPANT_COLUMNS =
  "id, personal_id, full_name, grade, school, agency, nationality, gender, email, external_ref, created_at, updated_at";

// Escape LIKE wildcards so a lookup value is always matched literally
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function GET(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      {
        type: "https://docs.quizzly.app/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Missing, malformed, revoked or expired API key.",
      },
      { status: 401 }
    );
  }

  if (
    !ctx.scopes.includes("participants:read") &&
    !ctx.scopes.includes("participants:write")
  ) {
    return NextResponse.json(
      {
        type: "https://docs.quizzly.app/errors/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "API key lacks participants:read (or participants:write) scope.",
      },
      { status: 403 }
    );
  }

  const params = request.nextUrl.searchParams;
  const provided = LOOKUP_FIELDS.filter((f) => (params.get(f) ?? "").trim() !== "");

  if (provided.length !== 1) {
    return NextResponse.json(
      {
        type: "https://docs.quizzly.app/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "Provide exactly one of: personal_id, external_ref, email.",
        errors: LOOKUP_FIELDS.map((field) => ({
          field,
          code: provided.length === 0 ? "missing" : "ambiguous",
        })),
      },
      { status: 400 }
    );
  }

  const field: LookupField = provided[0]!;
  const value = params.get(field)!.trim();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("org_id", ctx.orgId)
    .ilike(field, escapeLike(value))
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        type: "https://docs.quizzly.app/errors/internal",
        title: "Internal error",
        status: 500,
        detail: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    exists: data !== null,
    matched_by: field,
    participant: data ?? null,
  });
}
