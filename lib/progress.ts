import { deriveTokenStatus } from "@/lib/auth/token-status";

/**
 * Per-participant progress for one quiz in one competition session, derived
 * from that participant's tokens and the attempts they opened.
 *
 * Shared by the admin Live page and `POST /api/v1/competition-sessions/{id}/progress`
 * so an operator and a partner app reading the same participant can never see
 * different numbers.
 */

export type LiveTokenStatus = "valid" | "not_yet_valid" | "used" | "expired" | "revoked";
export type AttemptState = "not_started" | "logged_in" | "in_progress" | "submitted" | "voided";

export interface ProgressAttemptRow {
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

export interface ProgressTokenRow {
  id: string;
  created_at: string;
  expires_at: string;
  not_before: string | null;
  redeemed_at: string | null;
  revoked_at: string | null;
  quiz_sessions: ProgressAttemptRow | ProgressAttemptRow[] | null;
}

export function liveStatus(t: ProgressTokenRow, now: Date): LiveTokenStatus {
  const s = deriveTokenStatus(t, now);
  if (s === "redeemed") return "used";
  if (s === "active") return "valid";
  return s;
}

export function attemptStateOf(a: ProgressAttemptRow | null): AttemptState {
  if (!a) return "not_started";
  switch (a.state) {
    case "submitted": return "submitted";
    case "active":    return "in_progress";
    case "voided":    return "voided";
    default:          return "logged_in";
  }
}

// The code that matters: a usable one first, else one they used, else the newest.
const RANK: Record<LiveTokenStatus, number> = { valid: 0, not_yet_valid: 0, used: 1, expired: 2, revoked: 3 };

export interface ParticipantProgress<T extends ProgressTokenRow> {
  /** The token shown for this participant. */
  current: T;
  currentStatus: LiveTokenStatus;
  /** Every status counted separately; callers choose how to group them. */
  tokens: { issued: number } & Record<LiveTokenStatus, number>;
  /** The attempt shown: the submitted one, else the newest, if any. */
  attempt: ProgressAttemptRow | null;
  state: AttemptState;
  answered: number;
  totalQuestions: number;
}

/**
 * @param list   every token this participant holds for the quiz, **newest first**
 * @param questionCount the quiz version's question count, used when no attempt
 *               has fixed a question order yet
 */
export function summariseParticipant<T extends ProgressTokenRow>(
  list: T[],
  questionCount: number,
  now: Date,
): ParticipantProgress<T> {
  const tokens = { issued: list.length, valid: 0, not_yet_valid: 0, used: 0, expired: 0, revoked: 0 };
  for (const t of list) tokens[liveStatus(t, now)]++;

  const current = list.reduce((best, t) => (RANK[liveStatus(t, now)] < RANK[liveStatus(best, now)] ? t : best));
  const attempts = list
    .flatMap((t) => (Array.isArray(t.quiz_sessions) ? t.quiz_sessions : t.quiz_sessions ? [t.quiz_sessions] : []))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const attempt = attempts.find((a) => a.state === "submitted") ?? attempts[0] ?? null;

  const totalQuestions = attempt?.question_order?.length || questionCount || 0;
  return {
    current,
    currentStatus: liveStatus(current, now),
    tokens,
    attempt,
    state: attemptStateOf(attempt),
    answered: Math.min(attempt?.session_answers?.[0]?.count ?? 0, totalQuestions || Infinity),
    totalQuestions,
  };
}
