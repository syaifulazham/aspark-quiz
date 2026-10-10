import { createAdminClient } from "@/lib/supabase/admin";
import { summariseParticipant, type ProgressAttemptRow, type ProgressTokenRow } from "@/lib/progress";
import { normalizeCountry } from "./country";

// The per-participant rules live in lib/progress so the v1 progress API
// reports exactly what this page shows.
export type { LiveTokenStatus, AttemptState } from "@/lib/progress";
import type { LiveTokenStatus, AttemptState } from "@/lib/progress";

export interface LiveRow {
  participantId: string;
  /** The attempt shown for this participant (the submitted one, else the newest), if any. */
  attemptId: string | null;
  fullName: string;
  personalId: string;
  grade: string | null;
  school: string | null;
  country: string | null;
  tokenStatus: LiveTokenStatus;
  code: string | null;
  tokenExpiresAt: string | null;
  tokenCount: number;
  attemptState: AttemptState;
  startedAt: string | null;
  endedAt: string | null;
  deadlineAt: string | null;
  answered: number;
  totalQuestions: number;
  percentage: number | null;
}

export interface LiveStats {
  registered: number;
  issued: number;
  valid: number;
  used: number;
  expired: number;
  inProgress: number;
  submitted: number;
}

interface TokenRow extends ProgressTokenRow {
  participant_id: string;
  token_prefix: string;
  participant: {
    full_name: string;
    personal_id: string;
    grade: string | null;
    school: string | null;
    nationality: string | null;
  } | null;
  quiz_sessions: ProgressAttemptRow | ProgressAttemptRow[] | null;
}

const PAGE = 1000;

const countryOf = (t: TokenRow) => normalizeCountry(t.participant?.nationality);

export async function getLiveData(
  orgId: string,
  sessionId: string,
  quizVersionId: string,
  country: string | null = null
) {
  const supabase = createAdminClient();

  const [allTokens, { count: questionCount }] = await Promise.all([
    (async () => {
      const rows: TokenRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("session_tokens")
          .select(
            "id, participant_id, token_prefix, created_at, expires_at, not_before, redeemed_at, revoked_at, participant:participants!inner(full_name, personal_id, grade, school, nationality), quiz_sessions(id, state, created_at, started_at, deadline_at, submitted_at, percentage, question_order, session_answers(count))"
          )
          .eq("org_id", orgId)
          .eq("competition_session_id", sessionId)
          .eq("quiz_version_id", quizVersionId)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const batch = (data ?? []) as unknown as TokenRow[];
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
      return rows;
    })(),
    supabase
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("quiz_version_id", quizVersionId),
  ]);

  const tokens = country ? allTokens.filter((t) => countryOf(t) === country) : allTokens;

  const now = new Date();
  const stats: LiveStats = { registered: 0, issued: tokens.length, valid: 0, used: 0, expired: 0, inProgress: 0, submitted: 0 };
  const byParticipant = new Map<string, TokenRow[]>();

  for (const t of tokens) {
    const list = byParticipant.get(t.participant_id) ?? [];
    list.push(t); // already newest first
    byParticipant.set(t.participant_id, list);
  }

  const rows: LiveRow[] = [];
  for (const [participantId, list] of byParticipant) {
    const s = summariseParticipant(list, questionCount ?? 0, now);
    stats.valid   += s.tokens.valid + s.tokens.not_yet_valid; // the page has always grouped these
    stats.used    += s.tokens.used;
    stats.expired += s.tokens.expired;
    if (s.state === "in_progress") stats.inProgress++;
    if (s.state === "submitted") stats.submitted++;

    const { current, attempt } = s;
    const p = current.participant;
    rows.push({
      participantId,
      attemptId: attempt?.id ?? null,
      fullName: p?.full_name ?? "Unknown",
      personalId: p?.personal_id ?? "",
      grade: p?.grade ?? null,
      school: p?.school ?? null,
      country: p?.nationality ?? null,
      tokenStatus: s.currentStatus,
      code: current.token_prefix,
      tokenExpiresAt: current.expires_at,
      tokenCount: s.tokens.issued,
      attemptState: s.state,
      startedAt: attempt?.started_at ?? null,
      endedAt: attempt?.submitted_at ?? null,
      deadlineAt: attempt?.deadline_at ?? null,
      answered: s.answered,
      totalQuestions: s.totalQuestions,
      percentage: attempt?.percentage != null ? Number(attempt.percentage) : null,
    });
  }

  stats.registered = rows.length;
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" }));
  return { stats, rows, questionCount: questionCount ?? 0 };
}
