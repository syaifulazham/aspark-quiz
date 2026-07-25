import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json({ type: "unauthorized", title: "Invalid API key", status: 401 }, { status: 401 });
  }

  if (!ctx.scopes.includes("results:read") || !ctx.scopes.includes("tokens:write")) {
    return NextResponse.json(
      { type: "forbidden", title: "Insufficient scope", status: 403, detail: "Requires results:read and tokens:write" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const reason = (body as Record<string, unknown>).reason || "Voided via API";

  const supabase = createAdminClient();

  const { data: session, error } = await supabase
    .from("quiz_sessions")
    .select("id, state")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .single();

  if (error || !session) {
    return NextResponse.json({ type: "not_found", title: "Session not found", status: 404 }, { status: 404 });
  }

  const s = session as unknown as { id: string; state: string };

  if (s.state === "voided") {
    return NextResponse.json({ type: "conflict", title: "Session already voided", status: 409 }, { status: 409 });
  }

  await supabase
    .from("quiz_sessions")
    .update({
      state: "voided",
      integrity_flags: [{ type: "voided", reason, at: new Date().toISOString() }],
    } as never)
    .eq("id", id);

  return new NextResponse(null, { status: 204 });
}
