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
  const searchParams = request.nextUrl.searchParams;
  const quizId = searchParams.get("quiz_id");
  const includeAnswers = searchParams.get("include") === "answers";

  // Fetch participant
  const { data: participant, error: pErr } = await supabase
    .from("participants")
    .select("id, personal_id, full_name, school, agency")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .single();

  if (pErr || !participant) {
    return NextResponse.json(
      { type: "not_found", title: "Participant not found", status: 404 },
      { status: 404 }
    );
  }

  // Fetch sessions
  let query = supabase
    .from("quiz_sessions")
    .select("*")
    .eq("participant_id", id)
    .eq("org_id", ctx.orgId)
    .eq("state", "submitted")
    .order("submitted_at", { ascending: false });

  if (quizId) {
    // Get version IDs for this quiz
    const { data: versions } = await supabase
      .from("quiz_versions")
      .select("id")
      .eq("quiz_id", quizId);
    const versionIds = ((versions ?? []) as unknown as Array<{ id: string }>).map((v) => v.id);
    if (versionIds.length > 0) {
      query = query.in("quiz_version_id", versionIds);
    }
  }

  const { data: sessions } = await query;
  const rows = (sessions ?? []) as unknown as Array<Record<string, unknown>>;

  // Build summary
  const completedSessions = rows.filter((s) => s.state === "submitted");
  const bestPercentage = completedSessions.length > 0
    ? Math.max(...completedSessions.map((s) => Number(s.percentage) || 0))
    : null;
  const totalTimeSeconds = completedSessions.reduce((acc, s) => acc + (Number(s.duration_ms) || 0) / 1000, 0);

  // Build data array
  const data = await Promise.all(
    rows.map(async (session) => {
      // Get quiz info
      const { data: version } = await supabase
        .from("quiz_versions")
        .select("quiz_id, version, time_limit_seconds")
        .eq("id", session.quiz_version_id as string)
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

      const entry: Record<string, unknown> = {
        session_id: session.id,
        quiz: quizInfo,
        mode: session.mode,
        state: session.state,
        score: {
          raw: session.raw_score,
          max: session.max_score,
          percentage: session.percentage,
          passed: session.passed,
          correct: session.correct_count,
          incorrect: session.incorrect_count,
          unanswered: session.unanswered_count,
        },
        timing: {
          started_at: session.started_at,
          submitted_at: session.submitted_at,
          duration_ms: session.duration_ms,
          time_limit_seconds: v?.time_limit_seconds || null,
        },
        integrity_flags: session.integrity_flags,
      };

      if (includeAnswers) {
        const { data: answers } = await supabase
          .from("session_answers")
          .select("question_id, selected_option_id, numeric_response, is_correct, points_awarded, time_taken_ms, revision_count")
          .eq("session_id", session.id as string);

        entry.answers = (answers ?? []) as unknown[];
      }

      return entry;
    })
  );

  return NextResponse.json({
    participant,
    summary: {
      sessions_completed: completedSessions.length,
      best_percentage: bestPercentage,
      total_time_seconds: Math.round(totalTimeSeconds),
    },
    data,
    pagination: { next_cursor: null, has_more: false },
  });
}
