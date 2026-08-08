import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { type: "unauthorized", title: "Invalid API key", status: 401 },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("sessions:read")) {
    return NextResponse.json(
      {
        type: "forbidden",
        title: "Insufficient scope",
        status: 403,
        detail: "Requires sessions:read scope",
      },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();

  const { data: sessions, error } = await supabase
    .from("competition_sessions")
    .select(
      "id, slug, title, description, session_type, is_active, opens_at, closes_at, created_at, session_quiz_sets(id)"
    )
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { type: "internal", title: "Internal error", status: 500, detail: error.message },
      { status: 500 }
    );
  }

  const rows = (sessions ?? []) as unknown as Array<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    session_type: string;
    is_active: boolean;
    opens_at: string | null;
    closes_at: string | null;
    created_at: string;
    session_quiz_sets: Array<{ id: string }>;
  }>;

  const data = rows.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    description: s.description,
    session_type: s.session_type,
    is_active: s.is_active,
    opens_at: s.opens_at,
    closes_at: s.closes_at,
    quiz_count: s.session_quiz_sets.length,
  }));

  return NextResponse.json({ data });
}
