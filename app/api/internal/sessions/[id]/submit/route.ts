import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionJwt } from "@/lib/auth/session-jwt";

export async function POST(
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
    .select("id, state, org_id, quiz_version_id, started_at, question_order")
    .eq("id", id)
    .single();

  const s = session as unknown as {
    id: string;
    state: string;
    org_id: string;
    quiz_version_id: string;
    started_at: string;
    question_order: string[];
  } | null;

  if (!s) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (s.state === "submitted") {
    return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  }

  if (s.state !== "active") {
    return NextResponse.json({ error: "Session not active" }, { status: 409 });
  }

  const now = new Date();
  const durationMs = now.getTime() - new Date(s.started_at).getTime();

  // Grade answers
  const { data: answers } = await supabase
    .from("session_answers")
    .select("question_id, selected_option_id, numeric_response")
    .eq("session_id", id);

  const answerRows = (answers ?? []) as unknown as Array<{
    question_id: string;
    selected_option_id: string | null;
    numeric_response: number | null;
  }>;

  // Get all questions for this version
  const { data: questions } = await supabase
    .from("questions")
    .select("id, kind, points, numeric_answer, numeric_tolerance, question_options(id, is_correct)")
    .in("id", s.question_order);

  const questionMap = new Map<string, {
    kind: string;
    points: number;
    numeric_answer: number | null;
    numeric_tolerance: number;
    question_options: Array<{ id: string; is_correct: boolean }>;
  }>();

  ((questions ?? []) as unknown as Array<{
    id: string;
    kind: string;
    points: number;
    numeric_answer: number | null;
    numeric_tolerance: number;
    question_options: Array<{ id: string; is_correct: boolean }>;
  }>).forEach((q) => questionMap.set(q.id, q));

  let rawScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  for (const qId of s.question_order) {
    const q = questionMap.get(qId);
    if (!q) continue;
    maxScore += q.points;

    const a = answerRows.find((ans) => ans.question_id === qId);
    if (!a || (!a.selected_option_id && a.numeric_response === null)) {
      unansweredCount++;
      continue;
    }

    let isCorrect = false;

    if (q.kind === "mcq_single" || q.kind === "true_false") {
      const correctOption = q.question_options.find((o) => o.is_correct);
      isCorrect = a.selected_option_id === correctOption?.id;
    } else if (q.kind === "numeric" && q.numeric_answer !== null && a.numeric_response !== null) {
      isCorrect = Math.abs(a.numeric_response - q.numeric_answer) <= q.numeric_tolerance;
    }

    if (isCorrect) {
      correctCount++;
      rawScore += q.points;
    } else {
      incorrectCount++;
    }

    // Update answer with grading result
    await supabase
      .from("session_answers")
      .update({
        is_correct: isCorrect,
        points_awarded: isCorrect ? q.points : 0,
      } as never)
      .eq("session_id", id)
      .eq("question_id", qId);
  }

  const percentage = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;

  // Get passing score
  const { data: version } = await supabase
    .from("quiz_versions")
    .select("passing_score, show_feedback")
    .eq("id", s.quiz_version_id)
    .single();

  const v = version as unknown as { passing_score: number | null; show_feedback: string } | null;
  const passed = v?.passing_score != null ? rawScore >= v.passing_score : null;

  // Update session
  await supabase
    .from("quiz_sessions")
    .update({
      state: "submitted",
      submitted_at: now.toISOString(),
      duration_ms: durationMs,
      raw_score: rawScore,
      max_score: maxScore,
      percentage: Math.round(percentage * 100) / 100,
      passed,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      unanswered_count: unansweredCount,
    } as never)
    .eq("id", id);

  return NextResponse.json({
    state: "submitted",
    submitted_at: now.toISOString(),
    score: {
      raw: rawScore,
      max: maxScore,
      percentage: Math.round(percentage * 100) / 100,
      passed,
      correct: correctCount,
      incorrect: incorrectCount,
      unanswered: unansweredCount,
    },
    duration_ms: durationMs,
    show_feedback: v?.show_feedback || "never",
  });
}
