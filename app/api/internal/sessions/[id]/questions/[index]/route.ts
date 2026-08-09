import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionJwt } from "@/lib/auth/session-jwt";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const { id, index } = await params;
  const questionIndex = parseInt(index);

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
    .select("id, state, question_order, deadline_at")
    .eq("id", id)
    .single();

  const s = session as unknown as { id: string; state: string; question_order: string[]; deadline_at: string | null } | null;
  if (!s || s.state !== "active") {
    return NextResponse.json({ error: "Session not active" }, { status: 409 });
  }

  // Check deadline
  if (s.deadline_at && new Date(s.deadline_at) < new Date()) {
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }

  if (questionIndex < 0 || questionIndex >= s.question_order.length) {
    return NextResponse.json({ error: "Invalid question index" }, { status: 400 });
  }

  const questionId = s.question_order[questionIndex]!;

  // Fetch question (without correct answer info)
  const { data: question } = await supabase
    .from("questions")
    .select("id, kind, content_kind, stem, stem_html, points, time_seconds, media_key, media_alt, numeric_unit, question_options(id, label, label_html, position, media_key, media_alt)")
    .eq("id", questionId)
    .single();

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const q = question as unknown as {
    id: string;
    kind: string;
    content_kind: string;
    stem: { text?: string };
    stem_html: string | null;
    points: number;
    time_seconds: number | null;
    media_key: string | null;
    media_alt: string | null;
    numeric_unit: string | null;
    question_options: Array<{
      id: string;
      label: { text?: string };
      label_html: string | null;
      position: number;
      media_key: string | null;
      media_alt: string | null;
    }>;
  };

  // Get existing answer if any
  const { data: existingAnswer } = await supabase
    .from("session_answers")
    .select("selected_option_id, numeric_response")
    .eq("session_id", id)
    .eq("question_id", questionId)
    .single();

  const answer = existingAnswer as unknown as { selected_option_id: string | null; numeric_response: number | null } | null;

  // Record displayed_at if no answer exists yet
  if (!answer) {
    const { data: sessionRow } = await supabase.from("quiz_sessions").select("org_id").eq("id", id).single();
    const orgId = (sessionRow as unknown as { org_id: string } | null)?.org_id;
    if (orgId) {
      await supabase.from("session_answers").upsert({
        session_id: id,
        org_id: orgId,
        question_id: questionId,
        displayed_at: new Date().toISOString(),
        points_awarded: 0,
      } as never, { onConflict: "session_id,question_id" });
    }
  }

  return NextResponse.json({
    index: questionIndex,
    total: s.question_order.length,
    question: {
      id: q.id,
      kind: q.kind,
      content_kind: q.content_kind,
      stem: q.stem_html || q.stem?.text || "",
      points: q.points,
      time_seconds: q.time_seconds,
      media_key: q.media_key,
      media_alt: q.media_alt,
      numeric_unit: q.numeric_unit,
      options: q.question_options
        .sort((a, b) => a.position - b.position)
        .map((o) => ({
          id: o.id,
          label: o.label_html || o.label?.text || "",
          position: o.position,
          media_key: o.media_key,
          media_alt: o.media_alt,
        })),
    },
    current_answer: answer
      ? { selected_option_id: answer.selected_option_id, numeric_response: answer.numeric_response }
      : null,
    deadline_at: s.deadline_at,
  });
}
