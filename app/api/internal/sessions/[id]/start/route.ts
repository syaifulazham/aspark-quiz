import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionJwt } from "@/lib/auth/session-jwt";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify session JWT from cookie
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
    .select("id, state, quiz_version_id, question_order, token_id")
    .eq("id", id)
    .single();

  const s = session as unknown as { id: string; state: string; quiz_version_id: string; question_order: string[]; token_id: string } | null;
  if (!s) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (s.state !== "issued") {
    return NextResponse.json({ error: "Session already started", state: s.state }, { status: 409 });
  }

  // Get time limit from version
  const { data: version } = await supabase
    .from("quiz_versions")
    .select("time_limit_seconds")
    .eq("id", s.quiz_version_id)
    .single();

  let timeLimitSeconds = (version as unknown as { time_limit_seconds: number | null })?.time_limit_seconds;

  // A per-quiz time limit configured on the competition session overrides the version default
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

  const now = new Date();
  const deadlineAt = timeLimitSeconds
    ? new Date(now.getTime() + timeLimitSeconds * 1000).toISOString()
    : null;

  // Start session
  await supabase
    .from("quiz_sessions")
    .update({
      state: "active",
      started_at: now.toISOString(),
      deadline_at: deadlineAt,
    } as never)
    .eq("id", id);

  return NextResponse.json({
    state: "active",
    started_at: now.toISOString(),
    deadline_at: deadlineAt,
    question_count: s.question_order.length,
  });
}
