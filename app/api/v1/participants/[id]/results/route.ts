import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";
import { competitionSessionEmbed, competitionSessionOf } from "@/lib/tokens/competition-session-of";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Match a personal_id literally (case-insensitive) — no LIKE wildcards
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

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
  const quizIdParam = searchParams.get("quiz_id")?.trim() || null;
  const sessionParam = searchParams.get("competition_session_id")?.trim() || null;
  const setIdParam = searchParams.get("session_quiz_set_id")?.trim() || null;
  const includeAnswers = searchParams.get("include") === "answers";

  for (const [name, value] of [
    ["quiz_id", quizIdParam],
    ["competition_session_id", sessionParam],
    ["session_quiz_set_id", setIdParam],
  ] as const) {
    if (value && !UUID.test(value)) {
      return NextResponse.json(
        { type: "validation_error", title: "Validation failed", status: 400, detail: `${name} must be a uuid.` },
        { status: 400 }
      );
    }
  }

  // Fetch participant: {id} is the Quizzly UUID, or the caller's own personal_id
  const participantCols = "id, personal_id, full_name, school, agency";
  let participant: { id: string } | null = null;
  if (UUID.test(id)) {
    const { data } = await supabase
      .from("participants")
      .select(participantCols)
      .eq("id", id)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    participant = data as unknown as { id: string } | null;
  }
  if (!participant) {
    const { data } = await supabase
      .from("participants")
      .select(participantCols)
      .eq("org_id", ctx.orgId)
      .ilike("personal_id", escapeLike(id))
      .limit(1)
      .maybeSingle();
    participant = data as unknown as { id: string } | null;
  }

  if (!participant) {
    return NextResponse.json(
      { type: "not_found", title: "Participant not found", status: 404 },
      { status: 404 }
    );
  }
  const participantId = participant.id;

  // A session quiz (quiz within a session) pins both the session and the exact quiz version
  let competitionSessionId = sessionParam;
  let versionIds: string[] | null = null;
  if (setIdParam) {
    const { data: set } = await supabase
      .from("session_quiz_sets")
      .select("competition_session_id, quiz_version_id, quiz_version:quiz_versions!inner(quiz_id), competition_session:competition_sessions!inner(org_id)")
      .eq("id", setIdParam)
      .maybeSingle();
    const s = set as unknown as {
      competition_session_id: string;
      quiz_version_id: string;
      quiz_version: { quiz_id: string };
      competition_session: { org_id: string };
    } | null;
    if (!s || s.competition_session.org_id !== ctx.orgId) {
      return NextResponse.json(
        { type: "not_found", title: "Session quiz not found", status: 404, detail: "No session quiz with this session_quiz_set_id in this organisation." },
        { status: 404 }
      );
    }
    if (sessionParam && sessionParam !== s.competition_session_id) {
      return NextResponse.json(
        { type: "unprocessable", title: "Session mismatch", status: 422, code: "session_mismatch", detail: "session_quiz_set_id belongs to a different competition_session_id." },
        { status: 422 }
      );
    }
    if (quizIdParam && quizIdParam !== s.quiz_version.quiz_id) {
      return NextResponse.json(
        { type: "unprocessable", title: "Quiz mismatch", status: 422, code: "quiz_mismatch", detail: "session_quiz_set_id refers to a different quiz_id." },
        { status: 422 }
      );
    }
    competitionSessionId = s.competition_session_id;
    versionIds = [s.quiz_version_id];
  } else if (quizIdParam) {
    const { data: versions } = await supabase
      .from("quiz_versions")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("quiz_id", quizIdParam);
    versionIds = ((versions ?? []) as unknown as Array<{ id: string }>).map((v) => v.id);
    if (versionIds.length === 0) {
      return NextResponse.json(
        { type: "not_found", title: "Quiz not found", status: 404, detail: "No quiz with this quiz_id in this organisation." },
        { status: 404 }
      );
    }
  }

  // Fetch sessions
  let query = supabase
    .from("quiz_sessions")
    .select(`*, ${competitionSessionEmbed(!!competitionSessionId)}`)
    .eq("participant_id", participantId)
    .eq("org_id", ctx.orgId)
    .eq("state", "submitted")
    .order("submitted_at", { ascending: false });

  if (competitionSessionId) query = query.eq("token.competition_session_id", competitionSessionId);
  if (versionIds) query = query.in("quiz_version_id", versionIds);

  const { data: sessions } = await query;
  const rows = (sessions ?? []) as unknown as Array<Record<string, unknown>>;

  // Build summary
  const completedSessions = rows.filter((s) => s.state === "submitted");
  const bestPercentage = completedSessions.length > 0
    ? Math.max(...completedSessions.map((s) => Number(s.percentage) || 0))
    : null;
  const totalTimeSeconds = completedSessions.reduce((acc, s) => acc + (Number(s.duration_ms) || 0) / 1000, 0);

  // session_quiz_set_id for each (competition session, quiz version) pair in the results
  const sessionIds = [...new Set(rows.map((r) => competitionSessionOf(r)?.id).filter((v): v is string => !!v))];
  const setIdByPair = new Map<string, string>();
  if (sessionIds.length) {
    const { data: sets } = await supabase
      .from("session_quiz_sets")
      .select("id, competition_session_id, quiz_version_id")
      .in("competition_session_id", sessionIds);
    for (const s of (sets ?? []) as Array<{ id: string; competition_session_id: string; quiz_version_id: string }>) {
      setIdByPair.set(`${s.competition_session_id}:${s.quiz_version_id}`, s.id);
    }
  }

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

      const cs = competitionSessionOf(session);
      const entry: Record<string, unknown> = {
        session_id: session.id,
        competition_session: cs,
        session_quiz_set_id: cs ? setIdByPair.get(`${cs.id}:${session.quiz_version_id as string}`) ?? null : null,
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
