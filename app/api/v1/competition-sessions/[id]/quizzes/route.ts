import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const supabase = createAdminClient();

  // Verify the session belongs to this org
  const { data: session } = await supabase
    .from("competition_sessions")
    .select("id, title, slug")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .single();

  if (!session) {
    return NextResponse.json(
      {
        type: "not_found",
        title: "Session not found",
        status: 404,
        detail: "No competition session with this id in this organisation.",
      },
      { status: 404 }
    );
  }

  const { data: quizSets, error } = await supabase
    .from("session_quiz_sets")
    .select(
      "id, position, label, quiz_version_id, quiz_versions(id, version, status, time_limit_seconds, quizzes(id, slug, title))"
    )
    .eq("competition_session_id", id)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json(
      { type: "internal", title: "Internal error", status: 500, detail: error.message },
      { status: 500 }
    );
  }

  const rows = (quizSets ?? []) as unknown as Array<{
    id: string;
    position: number;
    label: string | null;
    quiz_version_id: string;
    quiz_versions: {
      id: string;
      version: number;
      status: string;
      time_limit_seconds: number | null;
      quizzes: { id: string; slug: string; title: string } | null;
    } | null;
  }>;

  const data = rows.map((qs) => ({
    session_quiz_set_id: qs.id,
    position: qs.position,
    label: qs.label,
    quiz_version_id: qs.quiz_version_id,
    quiz: qs.quiz_versions?.quizzes
      ? {
          id: qs.quiz_versions.quizzes.id,
          slug: qs.quiz_versions.quizzes.slug,
          title: qs.quiz_versions.quizzes.title,
        }
      : null,
    version: qs.quiz_versions?.version ?? null,
    status: qs.quiz_versions?.status ?? null,
    time_limit_seconds: qs.quiz_versions?.time_limit_seconds ?? null,
  }));

  return NextResponse.json({
    session: {
      id: (session as unknown as { id: string }).id,
      title: (session as unknown as { title: string }).title,
      slug: (session as unknown as { slug: string }).slug,
    },
    data,
  });
}
