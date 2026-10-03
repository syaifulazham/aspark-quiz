import { createAdminClient } from "@/lib/supabase/admin";
import { deriveTokenStatus } from "@/lib/auth/token-status";

export type LiveTokenStatus = "valid" | "not_yet_valid" | "used" | "expired" | "revoked";
export type AttemptState = "not_started" | "logged_in" | "in_progress" | "submitted" | "voided";

export interface LiveRow {
  participantId: string;
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

interface AttemptRow {
  id: string;
  state: string;
  created_at: string;
  started_at: string | null;
  deadline_at: string | null;
  submitted_at: string | null;
  percentage: number | string | null;
  question_order: string[] | null;
  session_answers: Array<{ count: number }> | null;
}

interface TokenRow {
  id: string;
  participant_id: string;
  token_prefix: string;
  created_at: string;
  expires_at: string;
  not_before: string | null;
  redeemed_at: string | null;
  revoked_at: string | null;
  participant: {
    full_name: string;
    personal_id: string;
    grade: string | null;
    school: string | null;
    nationality: string | null;
  } | null;
  quiz_sessions: AttemptRow | AttemptRow[] | null;
}

const PAGE = 1000;

function liveStatus(t: TokenRow, now: Date): LiveTokenStatus {
  const s = deriveTokenStatus(t, now);
  if (s === "redeemed") return "used";
  if (s === "active") return "valid";
  return s;
}

function attemptState(a: AttemptRow | null): AttemptState {
  if (!a) return "not_started";
  switch (a.state) {
    case "submitted":
      return "submitted";
    case "active":
      return "in_progress";
    case "voided":
      return "voided";
    default:
      return "logged_in";
  }
}

export async function getLiveData(orgId: string, sessionId: string, quizVersionId: string) {
  const supabase = createAdminClient();

  const [tokens, { count: questionCount }] = await Promise.all([
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

  const now = new Date();
  const stats: LiveStats = { registered: 0, issued: tokens.length, valid: 0, used: 0, expired: 0, inProgress: 0, submitted: 0 };
  const byParticipant = new Map<string, TokenRow[]>();

  for (const t of tokens) {
    const s = liveStatus(t, now);
    if (s === "valid" || s === "not_yet_valid") stats.valid++;
    else if (s === "used") stats.used++;
    else if (s === "expired") stats.expired++;
    const list = byParticipant.get(t.participant_id) ?? [];
    list.push(t); // already newest first
    byParticipant.set(t.participant_id, list);
  }

  const rows: LiveRow[] = [];
  for (const [participantId, list] of byParticipant) {
    // The code that matters: a usable one first, else one they used, else the newest (list is newest first)
    const rank: Record<LiveTokenStatus, number> = { valid: 0, not_yet_valid: 0, used: 1, expired: 2, revoked: 3 };
    const current = list.reduce((best, t) =>
      rank[liveStatus(t, now)] < rank[liveStatus(best, now)] ? t : best
    );
    const attempts = list
      .flatMap((t) => (Array.isArray(t.quiz_sessions) ? t.quiz_sessions : t.quiz_sessions ? [t.quiz_sessions] : []))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const attempt = attempts.find((a) => a.state === "submitted") ?? attempts[0] ?? null;
    const state = attemptState(attempt);
    if (state === "in_progress") stats.inProgress++;
    if (state === "submitted") stats.submitted++;

    const total = attempt?.question_order?.length || questionCount || 0;
    const p = current.participant;
    rows.push({
      participantId,
      fullName: p?.full_name ?? "Unknown",
      personalId: p?.personal_id ?? "",
      grade: p?.grade ?? null,
      school: p?.school ?? null,
      country: p?.nationality ?? null,
      tokenStatus: liveStatus(current, now),
      code: current.token_prefix,
      tokenExpiresAt: current.expires_at,
      tokenCount: list.length,
      attemptState: state,
      startedAt: attempt?.started_at ?? null,
      endedAt: attempt?.submitted_at ?? null,
      deadlineAt: attempt?.deadline_at ?? null,
      answered: Math.min(attempt?.session_answers?.[0]?.count ?? 0, total || Infinity),
      totalQuestions: total,
      percentage: attempt?.percentage != null ? Number(attempt.percentage) : null,
    });
  }

  stats.registered = rows.length;
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" }));
  return { stats, rows, questionCount: questionCount ?? 0 };
}
