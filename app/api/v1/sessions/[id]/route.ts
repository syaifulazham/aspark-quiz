import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { type: "unauthorized", title: "Invalid API key", status: 401 },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("results:read")) {
    return NextResponse.json(
      { type: "forbidden", title: "Insufficient scope", status: 403, detail: "Requires results:read scope" },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();

  // Fetch session with participant info
  const { data: session, error } = await supabase
    .from("quiz_sessions")
    .select("*, participants(personal_id, full_name, school, agency)")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .single();

  if (error || !session) {
    return NextResponse.json(
      { type: "not_found", title: "Session not found", status: 404 },
      { status: 404 }
    );
  }

  const s = session as unknown as Record<string, unknown>;

  // Get quiz info
  const { data: version } = await supabase
    .from("quiz_versions")
    .select("quiz_id, version, time_limit_seconds")
    .eq("id", s.quiz_version_id as string)
    .single();

  const v = version as unknown as { quiz_id: string; version: number; time_limit_seconds: number | null } | null;

  let quizInfo = null;
  if (v) {
    const { data: quiz } = await supabase
      .from("quizzes")
      .select("id, title")
      .eq("id", v.quiz_id)
      .single();
    quizInfo = quiz ? { ...(quiz as unknown as { id: string; title: string }), version: v.version } : null;
  }

  // Fetch answers
  const { data: answers } = await supabase
    .from("session_answers")
    .select("question_id, selected_option_id, numeric_response, is_correct, points_awarded, time_taken_ms, revision_count, displayed_at, answered_at")
    .eq("session_id", id)
    .order("displayed_at", { ascending: true });

  return NextResponse.json({
    session_id: s.id,
    participant_id: s.participant_id,
    participant: s.participants,
    quiz: quizInfo,
    mode: s.mode,
    state: s.state,
    score: {
      raw: s.raw_score,
      max: s.max_score,
      percentage: s.percentage,
      passed: s.passed,
      correct: s.correct_count,
      incorrect: s.incorrect_count,
      unanswered: s.unanswered_count,
    },
    timing: {
      started_at: s.started_at,
      submitted_at: s.submitted_at,
      duration_ms: s.duration_ms,
      time_limit_seconds: v?.time_limit_seconds || null,
    },
    integrity_flags: s.integrity_flags,
    answers: answers ?? [],
  });
}
