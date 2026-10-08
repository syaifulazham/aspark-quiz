import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLiveData, type AttemptState } from "@/app/(admin)/admin/live/data";

export type ReportInclude = "submitted" | "all";

export interface ReportOption {
  id: string;
  letter: string;
  text: string;
  mediaKey: string | null;
  mediaAlt: string | null;
  isCorrect: boolean;
}

export interface ReportQuestion {
  id: string;
  kind: "mcq_single" | "true_false" | "numeric";
  stem: string;
  mediaKey: string | null;
  mediaAlt: string | null;
  points: number;
  numericAnswer: number | null;
  numericTolerance: number;
  numericUnit: string | null;
  options: ReportOption[];
}

export type ItemResult = "correct" | "incorrect" | "unanswered";

export interface ReportItem {
  number: number;
  question: ReportQuestion;
  selectedOptionId: string | null;
  numericResponse: number | null;
  boolResponse: boolean | null;
  result: ItemResult;
  pointsAwarded: number;
  speedBonus: number;
  timeTakenMs: number | null;
}

export interface ParticipantReport {
  participantId: string;
  fullName: string;
  personalId: string;
  grade: string | null;
  school: string | null;
  country: string | null;
  attemptState: AttemptState;
  startedAt: string | null;
  submittedAt: string | null;
  durationMs: number | null;
  rawScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  correct: number;
  incorrect: number;
  unanswered: number;
  items: ReportItem[];
}

export interface PaperDetails {
  sessionTitle: string;
  paperLabel: string;
  quizTitle: string;
  quizVersion: number;
  questionCount: number;
  totalPoints: number;
  timeLimitSeconds: number | null;
  passingScore: number | null;
  negativeMarking: number;
}

export type ReportResult =
  | { ok: false; status: 401 | 403 | 404; message: string }
  | { ok: true; paper: PaperDetails; participants: ParticipantReport[]; skipped: number };

interface QuestionRow {
  id: string;
  position: number;
  kind: ReportQuestion["kind"];
  stem: { text?: string } | null;
  stem_plain: string | null;
  media_key: string | null;
  media_alt: string | null;
  points: number | string;
  numeric_answer: number | string | null;
  numeric_tolerance: number | string | null;
  numeric_unit: string | null;
  question_options: Array<{
    id: string;
    position: number;
    label: { text?: string } | null;
    media_key: string | null;
    media_alt: string | null;
    is_correct: boolean;
  }>;
}

interface AttemptRow {
  id: string;
  participant_id: string;
  question_order: string[] | null;
  started_at: string | null;
  submitted_at: string | null;
  duration_ms: number | null;
  raw_score: number | string | null;
  max_score: number | string | null;
  percentage: number | string | null;
  passed: boolean | null;
}

interface AnswerRow {
  session_id: string;
  question_id: string;
  selected_option_id: string | null;
  numeric_response: number | string | null;
  bool_response: boolean | null;
  is_correct: boolean | null;
  points_awarded: number | string;
  speed_bonus: number | string;
  time_taken_ms: number | null;
}

const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));
const CHUNK = 200;
const PAGE = 1000;

function chunks<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Correctness for an answer that the submit step has not marked yet (attempt still in progress). */
function deriveCorrect(q: ReportQuestion, a: AnswerRow): boolean {
  if (q.kind === "numeric") {
    const r = num(a.numeric_response);
    return r != null && q.numericAnswer != null && Math.abs(r - q.numericAnswer) <= q.numericTolerance;
  }
  return q.options.some((o) => o.id === a.selected_option_id && o.isCorrect);
}

/**
 * Everything needed to print the answer scripts for one quiz in one competition session:
 * the paper, and for each participant the questions they were given (in their order) with their answers.
 * Wrapped in cache() so the page and its metadata share one load per request.
 */
export const loadReport = cache(async function loadReport(params: {
  sessionId: string;
  quizVersionId: string;
  country: string | null;
  participantId: string | null;
  include: ReportInclude;
}): Promise<ReportResult> {
  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Please sign in." };

  const { data: profile } = await authClient.from("profiles").select("org_id, role").eq("id", user.id).single();
  const caller = profile as unknown as { org_id: string; role: string } | null;
  if (!caller) return { ok: false, status: 401, message: "Please sign in." };
  // The report reveals the correct answers, so it is limited to the roles that manage the live page.
  if (caller.role !== "owner" && caller.role !== "admin") {
    return { ok: false, status: 403, message: "Only owners and admins can export answer scripts." };
  }

  const supabase = createAdminClient();

  const [{ data: sessionRow }, { data: setRow }, { data: questionRows, error: qErr }] = await Promise.all([
    supabase
      .from("competition_sessions")
      .select("id, title")
      .eq("id", params.sessionId)
      .eq("org_id", caller.org_id)
      .maybeSingle(),
    supabase
      .from("session_quiz_sets")
      .select(
        "label, time_limit_seconds, quiz_version:quiz_versions!inner(id, org_id, version, time_limit_seconds, passing_score, negative_marking, quiz:quizzes(title))"
      )
      .eq("competition_session_id", params.sessionId)
      .eq("quiz_version_id", params.quizVersionId)
      .maybeSingle(),
    supabase
      .from("questions")
      .select(
        "id, position, kind, stem, stem_plain, media_key, media_alt, points, numeric_answer, numeric_tolerance, numeric_unit, question_options(id, position, label, media_key, media_alt, is_correct)"
      )
      .eq("quiz_version_id", params.quizVersionId)
      .order("position", { ascending: true }),
  ]);
  if (qErr) throw new Error(qErr.message);

  const session = sessionRow as unknown as { id: string; title: string } | null;
  const set = setRow as unknown as {
    label: string | null;
    time_limit_seconds: number | null;
    quiz_version: {
      id: string;
      org_id: string;
      version: number;
      time_limit_seconds: number | null;
      passing_score: number | string | null;
      negative_marking: number | string;
      quiz: { title: string } | null;
    };
  } | null;
  if (!session || !set || set.quiz_version.org_id !== caller.org_id) {
    return { ok: false, status: 404, message: "That session or quiz could not be found." };
  }

  const questions = new Map<string, ReportQuestion>();
  const positionOrder: string[] = [];
  for (const q of (questionRows ?? []) as unknown as QuestionRow[]) {
    const options = [...(q.question_options ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((o, i) => ({
        id: o.id,
        letter: String.fromCharCode(65 + i),
        text: o.label?.text ?? "",
        mediaKey: o.media_key,
        mediaAlt: o.media_alt,
        isCorrect: o.is_correct,
      }));
    questions.set(q.id, {
      id: q.id,
      kind: q.kind,
      stem: q.stem?.text || q.stem_plain || "",
      mediaKey: q.media_key,
      mediaAlt: q.media_alt,
      points: Number(q.points),
      numericAnswer: num(q.numeric_answer),
      numericTolerance: num(q.numeric_tolerance) ?? 0,
      numericUnit: q.numeric_unit,
      options,
    });
    positionOrder.push(q.id);
  }

  const qv = set.quiz_version;
  const quizTitle = qv.quiz?.title ?? "Untitled quiz";
  const paper: PaperDetails = {
    sessionTitle: session.title,
    paperLabel: set.label || `${quizTitle} (v${qv.version})`,
    quizTitle,
    quizVersion: qv.version,
    questionCount: questions.size,
    totalPoints: [...questions.values()].reduce((s, q) => s + q.points, 0),
    timeLimitSeconds: set.time_limit_seconds ?? qv.time_limit_seconds,
    passingScore: num(qv.passing_score),
    negativeMarking: Number(qv.negative_marking ?? 0),
  };

  // Same participant list and attempt choice as the live page, so the export always matches the table.
  const { rows } = await getLiveData(caller.org_id, params.sessionId, params.quizVersionId, params.country);
  const scoped = params.participantId ? rows.filter((r) => r.participantId === params.participantId) : rows;
  // A single participant is always shown whatever state they are in; bulk exports default to submitted scripts.
  const showAll = params.include === "all" || !!params.participantId;
  const wanted = scoped.filter((r) => r.attemptId && (showAll || r.attemptState === "submitted"));
  const skipped = scoped.length - wanted.length;

  const attemptIds = wanted.map((r) => r.attemptId!);
  const attempts = new Map<string, AttemptRow>();
  const answers = new Map<string, Map<string, AnswerRow>>();

  await Promise.all(
    chunks(attemptIds, CHUNK).map(async (ids) => {
      const { data, error } = await supabase
        .from("quiz_sessions")
        .select("id, participant_id, question_order, started_at, submitted_at, duration_ms, raw_score, max_score, percentage, passed")
        .in("id", ids);
      if (error) throw new Error(error.message);
      for (const a of (data ?? []) as unknown as AttemptRow[]) attempts.set(a.id, a);

      for (let from = 0; ; from += PAGE) {
        const { data: ans, error: aErr } = await supabase
          .from("session_answers")
          .select("session_id, question_id, selected_option_id, numeric_response, bool_response, is_correct, points_awarded, speed_bonus, time_taken_ms")
          .in("session_id", ids)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (aErr) throw new Error(aErr.message);
        const batch = (ans ?? []) as unknown as AnswerRow[];
        for (const a of batch) {
          const m = answers.get(a.session_id) ?? new Map<string, AnswerRow>();
          m.set(a.question_id, a);
          answers.set(a.session_id, m);
        }
        if (batch.length < PAGE) break;
      }
    })
  );

  const participants: ParticipantReport[] = [];
  for (const r of wanted) {
    const attempt = attempts.get(r.attemptId!);
    if (!attempt) continue;
    const given = attempt.question_order?.length ? attempt.question_order : positionOrder;
    const byQuestion = answers.get(attempt.id) ?? new Map<string, AnswerRow>();

    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    const items: ReportItem[] = [];
    given.forEach((qid, i) => {
      const q = questions.get(qid);
      if (!q) return;
      const a = byQuestion.get(qid);
      // A row is created when a question is first shown; it only counts as answered once a response is stored.
      const responded = !!a && (a.selected_option_id != null || a.numeric_response != null || a.bool_response != null);
      const isCorrect = responded ? (a!.is_correct ?? deriveCorrect(q, a!)) : false;
      const result: ItemResult = !responded ? "unanswered" : isCorrect ? "correct" : "incorrect";
      if (result === "correct") correct++;
      else if (result === "incorrect") incorrect++;
      else unanswered++;
      items.push({
        number: i + 1,
        question: q,
        selectedOptionId: a?.selected_option_id ?? null,
        numericResponse: num(a?.numeric_response),
        boolResponse: a?.bool_response ?? null,
        result,
        pointsAwarded: Number(a?.points_awarded ?? 0),
        speedBonus: Number(a?.speed_bonus ?? 0),
        timeTakenMs: a?.time_taken_ms ?? null,
      });
    });

    participants.push({
      participantId: r.participantId,
      fullName: r.fullName,
      personalId: r.personalId,
      grade: r.grade,
      school: r.school,
      country: r.country,
      attemptState: r.attemptState,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      durationMs: attempt.duration_ms,
      rawScore: num(attempt.raw_score),
      maxScore: num(attempt.max_score),
      percentage: num(attempt.percentage),
      passed: attempt.passed,
      correct,
      incorrect,
      unanswered,
      items,
    });
  }

  return { ok: true, paper, participants, skipped };
});
