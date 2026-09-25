import { createAdminClient } from "@/lib/supabase/admin";

export const MAX_PARTICIPANT_HITS = 100;
const MAX_TERMS = 6;

export interface ParticipantRow {
  id: string;
  personal_id: string;
  full_name: string;
  grade: string | null;
  school: string | null;
  agency: string | null;
  nationality: string | null;
  gender: string | null;
  date_of_birth: string | null;
  age: number | null;
  email: string | null;
  phone: string | null;
  external_ref: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  competition_session: { title: string } | null;
}

export interface Registration {
  tokenId: string;
  participantId: string;
  code: string;
  quizTitle: string;
  quizVersion: number | null;
  sessionTitle: string | null;
  issuedAt: string;
  expiresAt: string;
  notBefore: string | null;
  redeemedAt: string | null;
  revokedAt: string | null;
  attempt: {
    id: string;
    state: string;
    rawScore: number | null;
    maxScore: number | null;
    percentage: number | null;
    passed: boolean | null;
    correct: number | null;
    incorrect: number | null;
    unanswered: number | null;
    durationMs: number | null;
    startedAt: string | null;
    deadlineAt: string | null;
    submittedAt: string | null;
  } | null;
}

export type RegistrationStatus =
  | "submitted"
  | "in_progress"
  | "logged_in"
  | "voided"
  | "not_started"
  | "scheduled"
  | "expired"
  | "revoked";

export function registrationStatus(r: Registration, now = new Date()): RegistrationStatus {
  if (r.attempt) {
    switch (r.attempt.state) {
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
  if (r.revokedAt) return "revoked";
  if (new Date(r.expiresAt) < now) return "expired";
  if (r.notBefore && new Date(r.notBefore) > now) return "scheduled";
  return "not_started";
}

const PARTICIPANT_COLUMNS =
  "id, personal_id, full_name, grade, school, agency, nationality, gender, date_of_birth, age, email, phone, external_ref, metadata, created_at, updated_at, competition_session:competition_sessions(title)";

/**
 * Turn free text into PostgREST ilike patterns, one per word.
 * A word without `*` matches anywhere; a word containing `*` is used as a wildcard pattern as typed.
 */
export function toPatterns(q: string): string[] {
  return q
    .split(/\s+/)
    .map((t) => t.replace(/[,()"'\\:]/g, "").replace(/%/g, "*"))
    .filter((t) => t.replace(/\*/g, "") !== "")
    .slice(0, MAX_TERMS)
    .map((t) => (t.includes("*") ? t : `*${t}*`));
}

export async function searchParticipants(orgId: string, q: string) {
  const patterns = toPatterns(q);
  if (patterns.length === 0) return { participants: [] as ParticipantRow[], truncated: false };

  const supabase = createAdminClient();
  let query = supabase
    .from("participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("org_id", orgId);
  for (const p of patterns) {
    query = query.or(
      `full_name.ilike.${p},personal_id.ilike.${p},external_ref.ilike.${p},email.ilike.${p},school.ilike.${p}`
    );
  }
  const { data, error } = await query
    .order("full_name", { ascending: true })
    .limit(MAX_PARTICIPANT_HITS + 1);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as ParticipantRow[];
  return {
    participants: rows.slice(0, MAX_PARTICIPANT_HITS),
    truncated: rows.length > MAX_PARTICIPANT_HITS,
  };
}

export async function searchSchools(orgId: string, q: string) {
  const patterns = toPatterns(q);
  if (patterns.length === 0) return [];

  const supabase = createAdminClient();
  let query = supabase
    .from("participants")
    .select("school, nationality")
    .eq("org_id", orgId)
    .not("school", "is", null);
  for (const p of patterns) query = query.ilike("school", p);
  const { data, error } = await query.limit(5000);
  if (error) throw new Error(error.message);

  const bySchool = new Map<string, { count: number; countries: Set<string> }>();
  for (const r of (data ?? []) as Array<{ school: string | null; nationality: string | null }>) {
    const name = r.school?.trim();
    if (!name) continue;
    const entry = bySchool.get(name) ?? { count: 0, countries: new Set<string>() };
    entry.count++;
    if (r.nationality) entry.countries.add(r.nationality);
    bySchool.set(name, entry);
  }
  return [...bySchool.entries()]
    .map(([name, v]) => ({ name, participants: v.count, countries: [...v.countries].sort() }))
    .sort((a, b) => b.participants - a.participants || a.name.localeCompare(b.name));
}

export async function getParticipant(orgId: string, id: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as ParticipantRow | null) ?? null;
}

export async function getSchoolParticipants(orgId: string, school: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("org_id", orgId)
    .eq("school", school)
    .order("full_name", { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ParticipantRow[];
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
  competition_session: { title: string } | null;
  quiz_version: { version: number; quiz: { title: string } | null } | null;
  quiz_sessions: AttemptRow | AttemptRow[] | null;
}

interface AttemptRow {
  id: string;
  state: string;
  raw_score: number | null;
  max_score: number | null;
  percentage: number | null;
  passed: boolean | null;
  correct_count: number | null;
  incorrect_count: number | null;
  unanswered_count: number | null;
  duration_ms: number | null;
  started_at: string | null;
  deadline_at: string | null;
  submitted_at: string | null;
}

const num = (v: number | string | null) => (v == null ? null : Number(v));

export async function getRegistrations(orgId: string, participantIds: string[]) {
  const byParticipant = new Map<string, Registration[]>();
  if (participantIds.length === 0) return byParticipant;

  const supabase = createAdminClient();
  const CHUNK = 200;
  for (let i = 0; i < participantIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("session_tokens")
      .select(
        "id, participant_id, token_prefix, created_at, expires_at, not_before, redeemed_at, revoked_at, competition_session:competition_sessions(title), quiz_version:quiz_versions(version, quiz:quizzes(title)), quiz_sessions(id, state, raw_score, max_score, percentage, passed, correct_count, incorrect_count, unanswered_count, duration_ms, started_at, deadline_at, submitted_at)"
      )
      .eq("org_id", orgId)
      .in("participant_id", participantIds.slice(i, i + CHUNK))
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    for (const t of (data ?? []) as unknown as TokenRow[]) {
      const a = Array.isArray(t.quiz_sessions) ? t.quiz_sessions[0] : t.quiz_sessions;
      const reg: Registration = {
        tokenId: t.id,
        participantId: t.participant_id,
        code: t.token_prefix,
        quizTitle: t.quiz_version?.quiz?.title ?? "Unknown quiz",
        quizVersion: t.quiz_version?.version ?? null,
        sessionTitle: t.competition_session?.title ?? null,
        issuedAt: t.created_at,
        expiresAt: t.expires_at,
        notBefore: t.not_before,
        redeemedAt: t.redeemed_at,
        revokedAt: t.revoked_at,
        attempt: a
          ? {
              id: a.id,
              state: a.state,
              rawScore: num(a.raw_score),
              maxScore: num(a.max_score),
              percentage: num(a.percentage),
              passed: a.passed,
              correct: a.correct_count,
              incorrect: a.incorrect_count,
              unanswered: a.unanswered_count,
              durationMs: a.duration_ms,
              startedAt: a.started_at,
              deadlineAt: a.deadline_at,
              submittedAt: a.submitted_at,
            }
          : null,
      };
      const list = byParticipant.get(t.participant_id) ?? [];
      list.push(reg);
      byParticipant.set(t.participant_id, list);
    }
  }
  return byParticipant;
}
