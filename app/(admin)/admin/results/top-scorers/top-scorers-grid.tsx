import { createAdminClient } from "@/lib/supabase/admin";
import { QuizCard, type Scorer } from "./quiz-card";

interface Props {
  sessionId: string;
  countries: string[];
}

interface QuizSetRow {
  quiz_version_id: string;
  label: string | null;
  quiz_version: { version: number; quiz: { title: string } };
}

interface ResultRow {
  id: string;
  participant_id: string;
  quiz_version_id: string;
  raw_score: number | null;
  max_score: number | null;
  percentage: number | null;
  duration_ms: number | null;
  participants: {
    personal_id: string;
    full_name: string;
    school: string | null;
    grade: string | null;
    nationality: string | null;
  } | null;
}

const PAGE = 1000;

async function fetchSubmitted(sessionId: string, countries: string[]) {
  const supabase = createAdminClient();
  const rows: ResultRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("quiz_sessions")
      .select(
        "id, participant_id, quiz_version_id, raw_score, max_score, percentage, duration_ms, participants!inner(personal_id, full_name, school, grade, nationality), session_tokens!inner(competition_session_id)"
      )
      .eq("state", "submitted")
      .eq("session_tokens.competition_session_id", sessionId)
      .range(from, from + PAGE - 1);
    if (countries.length) query = query.in("participants.nationality", countries);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as ResultRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

function toScorer(r: ResultRow): Omit<Scorer, "rank"> {
  return {
    sessionId: r.id,
    fullName: r.participants?.full_name ?? "Unknown",
    personalId: r.participants?.personal_id ?? "",
    school: r.participants?.school ?? null,
    grade: r.participants?.grade ?? null,
    country: r.participants?.nationality ?? null,
    rawScore: Number(r.raw_score ?? 0),
    maxScore: Number(r.max_score ?? 0),
    percentage: Number(r.percentage ?? 0),
    durationMs: r.duration_ms,
  };
}

function compare(a: Omit<Scorer, "rank">, b: Omit<Scorer, "rank">) {
  if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
  return (a.durationMs ?? Number.MAX_SAFE_INTEGER) - (b.durationMs ?? Number.MAX_SAFE_INTEGER);
}

export async function TopScorersGrid({ sessionId, countries }: Props) {
  const supabase = createAdminClient();

  const [{ data: quizSetRows }, results] = await Promise.all([
    supabase
      .from("session_quiz_sets")
      .select(
        "quiz_version_id, label, quiz_version:quiz_versions!inner(version, quiz:quizzes(title))"
      )
      .eq("competition_session_id", sessionId)
      .order("position", { ascending: true }),
    fetchSubmitted(sessionId, countries),
  ]);

  const quizzes = ((quizSetRows ?? []) as unknown as QuizSetRow[]).map((qs) => ({
    quizVersionId: qs.quiz_version_id,
    label: qs.label || `${qs.quiz_version.quiz.title} (v${qs.quiz_version.version})`,
  }));

  // Best attempt per participant per quiz
  const best = new Map<string, Map<string, Omit<Scorer, "rank">>>();
  for (const r of results) {
    const s = toScorer(r);
    let perQuiz = best.get(r.quiz_version_id);
    if (!perQuiz) {
      perQuiz = new Map();
      best.set(r.quiz_version_id, perQuiz);
    }
    const prev = perQuiz.get(r.participant_id);
    if (!prev || compare(s, prev) < 0) perQuiz.set(r.participant_id, s);
  }

  const ranked = new Map<string, Scorer[]>();
  for (const [quizVersionId, perQuiz] of best) {
    const list = [...perQuiz.values()].sort(compare);
    ranked.set(
      quizVersionId,
      list.map((s, i) => ({ ...s, rank: i + 1 }))
    );
  }

  // Quizzes with results but not in the session's quiz set (defensive)
  for (const quizVersionId of ranked.keys()) {
    if (!quizzes.some((q) => q.quizVersionId === quizVersionId)) {
      quizzes.push({ quizVersionId, label: "Unknown quiz" });
    }
  }

  if (quizzes.length === 0) {
    return (
      <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] px-4 py-12 text-center text-[var(--muted-foreground)]">
        This session has no quizzes yet.
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {quizzes.map((q, i) => (
        <QuizCard
          key={q.quizVersionId}
          quizLabel={q.label}
          scorers={ranked.get(q.quizVersionId) ?? []}
          index={i}
        />
      ))}
    </div>
  );
}
