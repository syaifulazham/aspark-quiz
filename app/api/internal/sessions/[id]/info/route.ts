import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionJwt } from "@/lib/auth/session-jwt";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify session JWT
  const token = request.cookies.get("qz_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const payload = await verifySessionJwt(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  if (payload.sub !== id) {
    return NextResponse.json({ error: "Session mismatch" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Get session
  const { data: session } = await supabase
    .from("quiz_sessions")
    .select("id, state, quiz_version_id, participant_id, question_order, started_at, deadline_at, token_id")
    .eq("id", id)
    .single();

  const s = session as unknown as {
    id: string;
    state: string;
    quiz_version_id: string;
    participant_id: string;
    question_order: string[];
    started_at: string | null;
    deadline_at: string | null;
    token_id: string;
  } | null;

  if (!s) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Get participant info
  const { data: participant } = await supabase
    .from("participants")
    .select("personal_id, full_name, school")
    .eq("id", s.participant_id)
    .single();

  // Get quiz/version info
  const { data: version } = await supabase
    .from("quiz_versions")
    .select("quiz_id, version, time_limit_seconds, max_attempts, passing_score, allow_backtrack, show_feedback")
    .eq("id", s.quiz_version_id)
    .single();

  const v = version as unknown as {
    quiz_id: string;
    version: number;
    time_limit_seconds: number | null;
    max_attempts: number;
    passing_score: number | null;
    allow_backtrack: boolean;
    show_feedback: string;
  } | null;

  let quizTitle = "";
  if (v) {
    const { data: quiz } = await supabase.from("quizzes").select("title").eq("id", v.quiz_id).single();
    quizTitle = (quiz as unknown as { title: string } | null)?.title || "";
  }

  // A per-quiz time limit configured on the competition session overrides the version default
  let timeLimitSeconds = v?.time_limit_seconds ?? null;
  const { data: tokenRow } = await supabase
    .from("session_tokens")
    .select("competition_session_id")
    .eq("id", s.token_id)
    .single();

  const competitionSessionId = (tokenRow as unknown as { competition_session_id: string | null } | null)?.competition_session_id;

  if (competitionSessionId) {
    const { data: quizSet } = await supabase
      .from("session_quiz_sets")
      .select("time_limit_seconds")
      .eq("competition_session_id", competitionSessionId)
      .eq("quiz_version_id", s.quiz_version_id)
      .maybeSingle();

    const setLimit = (quizSet as unknown as { time_limit_seconds: number | null } | null)?.time_limit_seconds;
    if (setLimit != null) {
      timeLimitSeconds = setLimit;
    }
  }

  return NextResponse.json({
    session_id: s.id,
    state: s.state,
    started_at: s.started_at,
    deadline_at: s.deadline_at,
    question_count: s.question_order.length,
    participant: participant as unknown,
    quiz: {
      title: quizTitle,
      version: v?.version,
      time_limit_seconds: timeLimitSeconds,
      max_attempts: v?.max_attempts,
      passing_score: v?.passing_score,
      allow_backtrack: v?.allow_backtrack,
      show_feedback: v?.show_feedback,
    },
  });
}
