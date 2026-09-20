import { createAdminClient } from "@/lib/supabase/admin";

interface Props {
  sessionId: string;
  country?: string;
}

interface QuizSetRow {
  quiz_version_id: string;
  label: string | null;
  quiz_version: { version: number; quiz: { title: string } };
}

interface SessionRow {
  state: string;
  percentage: number | null;
  raw_score: number | null;
  max_score: number | null;
  passed: boolean | null;
  duration_ms: number | null;
}

interface TokenRow {
  participant_id: string;
  quiz_version_id: string;
  participants: { nationality: string | null } | null;
  quiz_sessions: SessionRow | SessionRow[] | null;
}

interface Attempt {
  percentage: number;
  rawScore: number;
  maxScore: number;
  passed: boolean | null;
  durationMs: number | null;
}

interface StatRow {
  quizVersionId: string;
  quizLabel: string;
  country: string;
  participants: Set<string>;
  best: Map<string, Attempt>; // best submitted attempt per participant
}

const UNKNOWN = "Unknown";
const PAGE = 1000;

function bestOf(a: Attempt | undefined, b: Attempt): Attempt {
  return !a || b.percentage > a.percentage ? b : a;
}

function pickSubmitted(qs: TokenRow["quiz_sessions"]): Attempt | null {
  const list = Array.isArray(qs) ? qs : qs ? [qs] : [];
  const s = list.find((x) => x.state === "submitted");
  if (!s) return null;
  return {
    percentage: Number(s.percentage ?? 0),
    rawScore: Number(s.raw_score ?? 0),
    maxScore: Number(s.max_score ?? 0),
    passed: s.passed,
    durationMs: s.duration_ms,
  };
}

function summarize(participants: Set<string>, best: Map<string, Attempt>) {
  const attempts = [...best.values()];
  const submitted = attempts.length;
  const graded = attempts.filter((a) => a.passed !== null);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  const durations = attempts
    .map((a) => a.durationMs)
    .filter((d): d is number => d != null && d > 0);
  return {
    participants: participants.size,
    submitted,
    notSubmitted: participants.size - submitted,
    passed: graded.length ? graded.filter((a) => a.passed).length : null,
    avgPercentage: avg(attempts.map((a) => a.percentage)),
    avgRaw: avg(attempts.map((a) => a.rawScore)),
    maxScore: attempts.length ? Math.max(...attempts.map((a) => a.maxScore)) : null,
    avgDurationMs: avg(durations),
  };
}

function fmtPct(v: number | null) {
  return v == null ? "—" : `${Math.round(v * 10) / 10}%`;
}

function fmtDuration(ms: number | null) {
  if (ms == null) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

async function fetchAllTokens(sessionId: string, country?: string) {
  const supabase = createAdminClient();
  const rows: TokenRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("session_tokens")
      .select(
        "participant_id, quiz_version_id, participants!inner(nationality), quiz_sessions(state, percentage, raw_score, max_score, passed, duration_ms)"
      )
      .eq("competition_session_id", sessionId)
      .range(from, from + PAGE - 1);
    if (country) query = query.eq("participants.nationality", country);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as TokenRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function StatsTable({ sessionId, country }: Props) {
  const supabase = createAdminClient();

  const [{ data: quizSetRows }, tokens] = await Promise.all([
    supabase
      .from("session_quiz_sets")
      .select(
        "quiz_version_id, label, quiz_version:quiz_versions!inner(version, quiz:quizzes(title))"
      )
      .eq("competition_session_id", sessionId)
      .order("position", { ascending: true }),
    fetchAllTokens(sessionId, country),
  ]);

  const quizLabels = new Map<string, string>();
  ((quizSetRows ?? []) as unknown as QuizSetRow[]).forEach((qs) =>
    quizLabels.set(
      qs.quiz_version_id,
      qs.label || `${qs.quiz_version.quiz.title} (v${qs.quiz_version.version})`
    )
  );
  const quizOrder = [...quizLabels.keys()];

  const groups = new Map<string, StatRow>();
  const perQuiz = new Map<string, { participants: Set<string>; best: Map<string, Attempt> }>();
  const overall = { participants: new Set<string>(), best: new Map<string, Attempt>() };

  for (const t of tokens) {
    const c = t.participants?.nationality?.trim() || UNKNOWN;
    const key = `${t.quiz_version_id}|${c}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        quizVersionId: t.quiz_version_id,
        quizLabel: quizLabels.get(t.quiz_version_id) ?? "Unknown quiz",
        country: c,
        participants: new Set(),
        best: new Map(),
      };
      groups.set(key, g);
    }
    let q = perQuiz.get(t.quiz_version_id);
    if (!q) {
      q = { participants: new Set(), best: new Map() };
      perQuiz.set(t.quiz_version_id, q);
    }

    g.participants.add(t.participant_id);
    q.participants.add(t.participant_id);
    overall.participants.add(`${t.quiz_version_id}|${t.participant_id}`);

    const attempt = pickSubmitted(t.quiz_sessions);
    if (attempt) {
      g.best.set(t.participant_id, bestOf(g.best.get(t.participant_id), attempt));
      q.best.set(t.participant_id, bestOf(q.best.get(t.participant_id), attempt));
      const ok = `${t.quiz_version_id}|${t.participant_id}`;
      overall.best.set(ok, bestOf(overall.best.get(ok), attempt));
    }
  }

  const rank = (id: string) => {
    const i = quizOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const rows = [...groups.values()].sort((a, b) => {
    const r = rank(a.quizVersionId) - rank(b.quizVersionId);
    if (r !== 0) return r;
    const l = a.quizLabel.localeCompare(b.quizLabel);
    if (l !== 0) return l;
    if (a.country === UNKNOWN) return 1;
    if (b.country === UNKNOWN) return -1;
    return a.country.localeCompare(b.country);
  });

  const totals = summarize(overall.participants, overall.best);

  const quizGroupSize = new Map<string, number>();
  rows.forEach((r) => quizGroupSize.set(r.quizVersionId, (quizGroupSize.get(r.quizVersionId) ?? 0) + 1));

  const cards = [
    { label: "Participants", value: totals.participants.toString() },
    { label: "Submitted", value: totals.submitted.toString() },
    { label: "Not yet submitted", value: totals.notSubmitted.toString() },
    { label: "Average score", value: fmtPct(totals.avgPercentage) },
  ];

  const th = "px-4 py-3 text-left font-medium text-[var(--muted-foreground)]";
  const thNum = "px-4 py-3 text-right font-medium text-[var(--muted-foreground)]";

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c, i) => (
          <div
            key={c.label}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-card p-4 animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
            style={{ animationDelay: `${i * 60}ms`, animationDuration: "350ms" }}
          >
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tracking-tight">
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--secondary)]">
            <tr>
              <th className={th}>Quiz</th>
              <th className={th}>Country</th>
              <th className={thNum}>Participants</th>
              <th className={thNum}>Submitted</th>
              <th className={thNum}>Not yet submitted</th>
              <th className={thNum}>Passed</th>
              <th className={thNum}>Avg. score</th>
              <th className={thNum}>Avg. time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[var(--muted-foreground)]">
                  No participants have been assigned to quizzes in this session yet.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const s = summarize(r.participants, r.best);
                const firstOfQuiz = rows[i - 1]?.quizVersionId !== r.quizVersionId;
                const groupSize = quizGroupSize.get(r.quizVersionId) ?? 1;
                const quizAgg = perQuiz.get(r.quizVersionId);
                const quizSummary = firstOfQuiz && groupSize > 1 && quizAgg
                  ? summarize(quizAgg.participants, quizAgg.best)
                  : null;
                return (
                  <tr
                    key={`${r.quizVersionId}|${r.country}`}
                    className="hover:bg-[var(--secondary)] animate-in fade-in fill-mode-both"
                    style={{ animationDelay: `${Math.min(i, 20) * 30}ms`, animationDuration: "300ms" }}
                  >
                    {firstOfQuiz && (
                      <td
                        rowSpan={groupSize}
                        className="px-4 py-3 align-top font-medium border-r border-[var(--border)]"
                      >
                        {r.quizLabel}
                        {quizSummary && (
                          <span className="mt-1 block text-xs font-normal text-muted-foreground">
                            All countries: {quizSummary.submitted}/{quizSummary.participants} submitted
                            {" · "}
                            {fmtPct(quizSummary.avgPercentage)}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 font-mono text-xs">{r.country}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.participants}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-success-500)]">
                      {s.submitted}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={s.notSubmitted > 0 ? "text-[var(--color-warning-500)]" : "text-muted-foreground"}>
                        {s.notSubmitted}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {s.passed == null ? (
                        <span className="text-muted-foreground" title="No passing score set for this quiz">—</span>
                      ) : (
                        `${s.passed}/${s.submitted}`
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono">{fmtPct(s.avgPercentage)}</span>
                      {s.avgRaw != null && s.maxScore != null && (
                        <span className="block text-xs text-muted-foreground">
                          {Math.round(s.avgRaw * 10) / 10}/{s.maxScore}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--muted-foreground)]">
                      {fmtDuration(s.avgDurationMs)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t border-[var(--border)] bg-[var(--secondary)] font-medium">
              <tr>
                <td className="px-4 py-3" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-3 text-right font-mono">{totals.participants}</td>
                <td className="px-4 py-3 text-right font-mono">{totals.submitted}</td>
                <td className="px-4 py-3 text-right font-mono">{totals.notSubmitted}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {totals.passed == null ? "—" : `${totals.passed}/${totals.submitted}`}
                </td>
                <td className="px-4 py-3 text-right font-mono">{fmtPct(totals.avgPercentage)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtDuration(totals.avgDurationMs)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
