import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { ResultsFilter } from "./results-client";

interface Props {
  searchParams: Promise<{
    session?: string;
    quiz?: string;
    school?: string;
    grade?: string;
    country?: string;
  }>;
}

interface CompetitionSessionRow {
  id: string;
  title: string;
}

interface QuizSetRow {
  quiz_version_id: string;
  label: string | null;
  quiz_version: {
    version: number;
    quiz: { title: string };
  };
}

interface ResultRow {
  id: string;
  raw_score: number | null;
  max_score: number | null;
  percentage: number | null;
  passed: boolean | null;
  duration_ms: number | null;
  submitted_at: string | null;
  participants: {
    personal_id: string;
    full_name: string;
    school: string | null;
    grade: string | null;
    nationality: string | null;
  } | null;
}

export default async function ResultsPage({ searchParams }: Props) {
  const {
    session: sessionId,
    quiz: quizVersionId,
    school: schoolFilter,
    grade: gradeFilter,
    country: countryFilter,
  } = await searchParams;

  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) notFound();

  const supabase = createAdminClient();

  // Distinct participant attribute values for the filter dropdowns
  const { data: profile } = await authClient
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  const orgId = (profile as unknown as { org_id: string } | null)?.org_id;

  let schoolOptions: string[] = [];
  let gradeOptions: string[] = [];
  let countryOptions: string[] = [];
  if (orgId) {
    const { data: participantRows } = await supabase
      .from("participants")
      .select("school, grade, nationality")
      .eq("org_id", orgId);

    const rows = (participantRows ?? []) as unknown as Array<{
      school: string | null;
      grade: string | null;
      nationality: string | null;
    }>;
    const distinct = (vals: Array<string | null>) =>
      [...new Set(vals.filter((v): v is string => !!v && v.trim() !== ""))].sort();

    schoolOptions = distinct(rows.map((r) => r.school));
    gradeOptions = distinct(rows.map((r) => r.grade));
    countryOptions = distinct(rows.map((r) => r.nationality));
  }

  // All competition sessions for the selector
  const { data: sessionRows } = await supabase
    .from("competition_sessions")
    .select("id, title")
    .order("created_at", { ascending: false });

  const sessions = (sessionRows ?? []) as unknown as CompetitionSessionRow[];
  const selectedSession = sessions.find((s) => s.id === sessionId) ?? null;

  // Quizzes within the selected session
  let quizzes: Array<{ quizVersionId: string; label: string }> = [];
  if (selectedSession) {
    const { data: quizSetRows } = await supabase
      .from("session_quiz_sets")
      .select(
        "quiz_version_id, label, quiz_version:quiz_versions!inner(version, quiz:quizzes(title))"
      )
      .eq("competition_session_id", selectedSession.id)
      .order("position", { ascending: true });

    quizzes = ((quizSetRows ?? []) as unknown as QuizSetRow[]).map((qs) => ({
      quizVersionId: qs.quiz_version_id,
      label:
        qs.label ||
        `${qs.quiz_version.quiz.title} (v${qs.quiz_version.version})`,
    }));
  }

  const selectedQuiz = quizzes.find((q) => q.quizVersionId === quizVersionId) ?? null;

  // Results for the selected session + quiz
  let results: ResultRow[] = [];
  if (selectedSession && selectedQuiz) {
    let query = supabase
      .from("quiz_sessions")
      .select(
        "id, raw_score, max_score, percentage, passed, duration_ms, submitted_at, participants!inner(personal_id, full_name, school, grade, nationality), session_tokens!inner(competition_session_id, quiz_version_id)"
      )
      .eq("state", "submitted")
      .eq("session_tokens.competition_session_id", selectedSession.id)
      .eq("session_tokens.quiz_version_id", selectedQuiz.quizVersionId);

    if (schoolFilter) query = query.eq("participants.school", schoolFilter);
    if (gradeFilter) query = query.eq("participants.grade", gradeFilter);
    if (countryFilter) query = query.eq("participants.nationality", countryFilter);

    const { data } = await query
      .order("submitted_at", { ascending: false })
      .limit(500);

    results = ((data ?? []) as unknown as ResultRow[]).sort((a, b) => {
      // Score descending, then fastest duration first
      const scoreDiff = (b.raw_score ?? -1) - (a.raw_score ?? -1);
      if (scoreDiff !== 0) return scoreDiff;
      const aDur = a.duration_ms ?? Number.MAX_SAFE_INTEGER;
      const bDur = b.duration_ms ?? Number.MAX_SAFE_INTEGER;
      return aDur - bDur;
    });
  }

  const submittedCount = results.length;
  const avgPercentage =
    submittedCount > 0
      ? Math.round(
          (results.reduce((sum, r) => sum + (r.percentage ?? 0), 0) /
            submittedCount) *
            10
        ) / 10
      : null;
  const passCount = results.filter((r) => r.passed).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Results
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a competition session and quiz to view results.
      </p>

      <div className="mt-4">
        <ResultsFilter
          sessions={sessions}
          quizzes={quizzes}
          schools={schoolOptions}
          grades={gradeOptions}
          countries={countryOptions}
        />
      </div>

      {selectedSession && selectedQuiz && (
        <h2 className="mt-6 font-display text-xl font-semibold tracking-tight">
          {selectedSession.title}
          <span className="mx-2 text-muted-foreground">›</span>
          {selectedQuiz.label}
        </h2>
      )}

      {selectedSession && selectedQuiz && (
        <div className="mt-2 flex gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Submitted: </span>
            <span className="font-medium">{submittedCount}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Average: </span>
            <span className="font-medium">
              {avgPercentage != null ? `${avgPercentage}%` : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Passed: </span>
            <span className="font-medium">
              {passCount}/{submittedCount}
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--secondary)]">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                #
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Participant
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Score
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Percentage
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Duration
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Submitted
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {results.length > 0 ? (
              results.map((s, i) => {
                const participant = s.participants;
                return (
                  <tr key={s.id} className="hover:bg-[var(--secondary)]">
                    <td className="px-4 py-3 font-mono text-[var(--muted-foreground)]">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">
                        {participant?.full_name || "Unknown"}
                      </span>
                      <br />
                      <span className="font-mono text-xs text-[var(--muted-foreground)]">
                        {participant?.personal_id}
                      </span>
                      {(participant?.school || participant?.grade || participant?.nationality) && (
                        <span className="block text-xs text-[var(--muted-foreground)]">
                          {[participant?.school, participant?.grade, participant?.nationality]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {s.raw_score ?? "—"}/{s.max_score ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {s.percentage != null ? (
                        <span
                          className={
                            s.passed
                              ? "text-[var(--color-success-500)]"
                              : "text-[var(--color-danger-500)]"
                          }
                        >
                          {s.percentage}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {s.duration_ms
                        ? `${Math.round(s.duration_ms / 1000)}s`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {s.submitted_at
                        ? new Date(s.submitted_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                >
                  {selectedSession && selectedQuiz
                    ? "No submitted sessions for this quiz yet."
                    : "Select a session and quiz above to view results."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
