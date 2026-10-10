import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey, type ApiKeyContext } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  summariseParticipant, type AttemptState, type LiveTokenStatus, type ProgressTokenRow,
} from "@/lib/progress";

const MAX_IDS = 500;
const IN_CHUNK = 100;   // keeps each `.in()` URL a few KB
const PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const err = (status: number, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json(
    { type: `https://docs.quizzly.app/errors/${status === 400 ? "validation" : status === 404 ? "not_found" : status === 403 ? "forbidden" : status === 401 ? "unauthorized" : status === 422 ? "unprocessable" : "internal"}`, title, status, detail, ...extra },
    { status },
  );

// The token vocabulary of GET /sessions/tokens/{id}, so partners see one set of words.
const API_TOKEN_STATUS: Record<LiveTokenStatus, string> = {
  valid: "active", not_yet_valid: "not_yet_valid", used: "redeemed", expired: "expired", revoked: "revoked",
};

interface Filters {
  personalIds: string[];
  participantIds: string[];
  quizId: string | null;
  setId: string | null;
}

interface QuizSet {
  session_quiz_set_id: string;
  quiz_version_id: string;
  quiz: { id: string; title: string; version: number | null };
}

interface TokenRow extends ProgressTokenRow {
  participant_id: string;
  quiz_version_id: string;
  participant: { personal_id: string; full_name: string; grade: string | null; school: string | null } | null;
}

const ATTEMPT_COLS = "id, state, created_at, started_at, deadline_at, submitted_at, percentage, question_order, session_answers(count)";
const TOKEN_COLS =
  `id, participant_id, quiz_version_id, created_at, expires_at, not_before, redeemed_at, revoked_at, ` +
  `participant:participants!inner(personal_id, full_name, grade, school), quiz_sessions(${ATTEMPT_COLS})`;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function strings(v: unknown, name: string): string[] | string {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return `${name} must be an array of strings.`;
  return [...new Set((v as string[]).map((s) => s.trim()).filter(Boolean))];
}

function parse(body: Record<string, unknown> | null): Filters | string {
  const personalIds = strings(body?.personal_ids, "personal_ids");
  if (typeof personalIds === "string") return personalIds;
  const participantIds = strings(body?.participant_ids, "participant_ids");
  if (typeof participantIds === "string") return participantIds;
  if (personalIds.length + participantIds.length > MAX_IDS)
    return `At most ${MAX_IDS} personal_ids + participant_ids per request.`;

  const quizId = typeof body?.quiz_id === "string" ? body.quiz_id.trim() || null : null;
  const setId  = typeof body?.session_quiz_set_id === "string" ? body.session_quiz_set_id.trim() || null : null;
  for (const [k, v] of [["quiz_id", quizId], ["session_quiz_set_id", setId]] as const)
    if (v && !UUID.test(v)) return `${k} must be a uuid.`;

  // Unbounded "the whole session" is deliberately not offered: a session can
  // hold dozens of quizzes and thousands of participants. Page by quiz.
  if (personalIds.length + participantIds.length === 0 && !quizId && !setId)
    return "Provide quiz_id or session_quiz_set_id, and/or personal_ids / participant_ids.";
  return { personalIds, participantIds, quizId, setId };
}

/**
 * Progress for participants of a competition session: how many login codes
 * each holds for a quiz, the state of the code that matters, and how far the
 * attempt has got. The same per-participant rules as the admin Live page.
 *
 *   POST /api/v1/competition-sessions/{id}/progress
 *     { quiz_id? | session_quiz_set_id?, personal_ids?: [...], participant_ids?: [...] }
 *   GET  /api/v1/competition-sessions/{id}/progress?quiz_id=…&personal_id=…
 *
 * Scopes: `results:read` and `tokens:read` (or `tokens:write`).
 *
 * Deliberately returns neither the login code nor a score: this feeds
 * teacher-facing dashboards, and a code is a credential while a score belongs
 * to the results endpoints.
 */
async function handle(ctx: ApiKeyContext, sessionId: string, f: Filters) {
  if (!UUID.test(sessionId)) return err(404, "Session not found", "No competition session with this id in this organisation.");
  const supabase = createAdminClient();

  const [{ data: session }, { data: setRows, error: setErr }] = await Promise.all([
    supabase.from("competition_sessions").select("id, title, slug").eq("id", sessionId).eq("org_id", ctx.orgId).maybeSingle(),
    supabase
      .from("session_quiz_sets")
      .select("id, quiz_version_id, quiz_versions(version, quizzes(id, title))")
      .eq("competition_session_id", sessionId),
  ]);
  if (!session) return err(404, "Session not found", "No competition session with this id in this organisation.");
  if (setErr) return err(500, "Internal error", setErr.message);

  let sets: QuizSet[] = ((setRows ?? []) as unknown as Array<{
    id: string; quiz_version_id: string;
    quiz_versions: { version: number; quizzes: { id: string; title: string } | null } | null;
  }>).map((s) => ({
    session_quiz_set_id: s.id,
    quiz_version_id: s.quiz_version_id,
    quiz: { id: s.quiz_versions?.quizzes?.id ?? "", title: s.quiz_versions?.quizzes?.title ?? "", version: s.quiz_versions?.version ?? null },
  }));

  // A key restricted to some quizzes sees only those.
  if (ctx.quizIds) sets = sets.filter((s) => ctx.quizIds!.includes(s.quiz.id));

  if (f.setId) {
    sets = sets.filter((s) => s.session_quiz_set_id === f.setId);
    if (sets.length === 0) return err(422, "Quiz not in session", "session_quiz_set_id does not belong to this session (or this key may not read it).", { code: "quiz_not_in_session" });
  }
  if (f.quizId) {
    sets = sets.filter((s) => s.quiz.id === f.quizId);
    if (sets.length === 0) return err(422, "Quiz not in session", "quiz_id is not attached to this session (or this key may not read it).", { code: "quiz_not_in_session" });
  }

  const setByVersion = new Map(sets.map((s) => [s.quiz_version_id, s]));
  const versionIds = [...setByVersion.keys()];
  const emptyBody = () => ({ competition_session: session, summary: summarise([]), data: [], without_tokens: [], not_found: [] as string[] });
  if (versionIds.length === 0) return NextResponse.json(emptyBody());

  // ── Resolve the participant filter (org-scoped) ──────────────────────────
  const filtered = f.personalIds.length + f.participantIds.length > 0;
  const people = new Map<string, { personal_id: string }>();
  const notFound: string[] = [];

  if (f.personalIds.length) {
    // personal_id matching is case-insensitive elsewhere (token issue uses
    // ilike); `.in()` is exact, so send the common case variants.
    const variants = [...new Set(f.personalIds.flatMap((p) => [p, p.toLowerCase(), p.toUpperCase()]))];
    const found = await Promise.all(chunk(variants, IN_CHUNK).map((part) =>
      supabase.from("participants").select("id, personal_id").eq("org_id", ctx.orgId).in("personal_id", part)));
    const bad = found.find((r) => r.error);
    if (bad?.error) return err(500, "Internal error", bad.error.message);
    const byLower = new Map<string, { id: string; personal_id: string }>();
    for (const r of found) for (const p of (r.data ?? []) as Array<{ id: string; personal_id: string }>) byLower.set(p.personal_id.toLowerCase(), p);
    for (const pid of f.personalIds) {
      const p = byLower.get(pid.toLowerCase());
      if (p) people.set(p.id, { personal_id: p.personal_id }); else notFound.push(pid);
    }
  }
  if (f.participantIds.length) {
    const valid = f.participantIds.filter((id) => UUID.test(id));
    notFound.push(...f.participantIds.filter((id) => !UUID.test(id)));
    const found = await Promise.all(chunk(valid, IN_CHUNK).map((part) =>
      supabase.from("participants").select("id, personal_id").eq("org_id", ctx.orgId).in("id", part)));
    const bad = found.find((r) => r.error);
    if (bad?.error) return err(500, "Internal error", bad.error.message);
    const known = new Set<string>();
    for (const r of found) for (const p of (r.data ?? []) as Array<{ id: string; personal_id: string }>) { people.set(p.id, { personal_id: p.personal_id }); known.add(p.id); }
    notFound.push(...valid.filter((id) => !known.has(id)));
  }
  if (filtered && people.size === 0) return NextResponse.json({ ...emptyBody(), not_found: notFound });

  // ── Tokens in scope, newest first ────────────────────────────────────────
  const fetchTokens = async (participantPart: string[] | null) => {
    const rows: TokenRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabase
        .from("session_tokens")
        .select(TOKEN_COLS)
        .eq("org_id", ctx.orgId)
        .eq("competition_session_id", sessionId)
        .in("quiz_version_id", versionIds);
      if (participantPart) q = q.in("participant_id", participantPart);
      const { data, error } = await q.order("created_at", { ascending: false }).range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const batch = (data ?? []) as unknown as TokenRow[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    return rows;
  };

  let tokens: TokenRow[];
  try {
    tokens = filtered
      ? (await Promise.all(chunk([...people.keys()], IN_CHUNK).map(fetchTokens))).flat()
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
      : await fetchTokens(null);
  } catch (e) {
    return err(500, "Internal error", (e as Error).message);
  }

  // Question totals for participants who have not opened an attempt yet.
  const presentVersions = [...new Set(tokens.map((t) => t.quiz_version_id))];
  const counts = new Map<string, number>(await Promise.all(presentVersions.map(async (v) => {
    const { count } = await supabase.from("questions").select("*", { count: "exact", head: true }).eq("quiz_version_id", v);
    return [v, count ?? 0] as [string, number];
  })));

  // ── One row per (participant, quiz) ──────────────────────────────────────
  const groups = new Map<string, TokenRow[]>();
  for (const t of tokens) {
    const key = `${t.participant_id}:${t.quiz_version_id}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const now = new Date();
  const data = [...groups.values()].map((list) => {
    const first = list[0]!; // a group exists only once it holds a token
    const s = summariseParticipant(list, counts.get(first.quiz_version_id) ?? 0, now);
    const set = setByVersion.get(first.quiz_version_id)!;
    return {
      participant: {
        id: first.participant_id,
        personal_id: first.participant?.personal_id ?? null,
        full_name: first.participant?.full_name ?? null,
        grade: first.participant?.grade ?? null,
        school: first.participant?.school ?? null,
      },
      quiz: { id: set.quiz.id, title: set.quiz.title, version: set.quiz.version, session_quiz_set_id: set.session_quiz_set_id },
      tokens: {
        issued:        s.tokens.issued,
        active:        s.tokens.valid,
        not_yet_valid: s.tokens.not_yet_valid,
        redeemed:      s.tokens.used,
        expired:       s.tokens.expired,
        revoked:       s.tokens.revoked,
      },
      current_token: { token_id: s.current.id, status: API_TOKEN_STATUS[s.currentStatus], expires_at: s.current.expires_at },
      attempt: {
        session_id: s.attempt?.id ?? null,
        progress: s.state,
        started_at: s.attempt?.started_at ?? null,
        submitted_at: s.attempt?.submitted_at ?? null,
        deadline_at: s.attempt?.deadline_at ?? null,
        answered: s.answered,
        total_questions: s.totalQuestions,
      },
    };
  }).sort((a, b) => (a.participant.full_name ?? "").localeCompare(b.participant.full_name ?? "", undefined, { sensitivity: "base" }));

  const withTokens = new Set(data.map((d) => d.participant.id));
  return NextResponse.json({
    competition_session: session,
    summary: summarise(data),
    data,
    // Matched participants holding no code for these quizzes in this session.
    without_tokens: filtered ? [...people.entries()].filter(([id]) => !withTokens.has(id)).map(([, p]) => p.personal_id) : [],
    not_found: notFound,
  });
}

type Row = { tokens: { issued: number; active: number; not_yet_valid: number; redeemed: number; expired: number; revoked: number }; attempt: { progress: AttemptState } };

function summarise(data: Row[]) {
  const s = {
    participants: data.length, tokens_issued: 0, tokens_active: 0, tokens_redeemed: 0, tokens_expired: 0, tokens_revoked: 0,
    not_started: 0, logged_in: 0, in_progress: 0, submitted: 0, voided: 0,
  };
  for (const d of data) {
    s.tokens_issued   += d.tokens.issued;
    s.tokens_active   += d.tokens.active + d.tokens.not_yet_valid;
    s.tokens_redeemed += d.tokens.redeemed;
    s.tokens_expired  += d.tokens.expired;
    s.tokens_revoked  += d.tokens.revoked;
    s[d.attempt.progress]++;
  }
  return s;
}

async function authorise(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) return { res: err(401, "Unauthorized", "Missing, malformed, revoked or expired API key.") };
  const tokens = ctx.scopes.includes("tokens:read") || ctx.scopes.includes("tokens:write");
  if (!tokens || !ctx.scopes.includes("results:read"))
    return { res: err(403, "Forbidden", "Requires results:read and tokens:read (or tokens:write).") };
  return { ctx };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await authorise(request);
  if (!a.ctx) return a.res;
  const body = await request.json().catch(() => null);
  if (body !== null && (typeof body !== "object" || Array.isArray(body)))
    return err(400, "Validation failed", "Body must be a JSON object.");
  const f = parse(body as Record<string, unknown> | null);
  if (typeof f === "string") return err(400, "Validation failed", f);
  return handle(a.ctx, (await params).id, f);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await authorise(request);
  if (!a.ctx) return a.res;
  const q = request.nextUrl.searchParams;
  const one = (k: string) => (q.get(k) ? [q.get(k)!] : undefined);
  const f = parse({
    quiz_id: q.get("quiz_id") ?? undefined,
    session_quiz_set_id: q.get("session_quiz_set_id") ?? undefined,
    personal_ids: one("personal_id"),
    participant_ids: one("participant_id"),
  });
  if (typeof f === "string") return err(400, "Validation failed", f);
  return handle(a.ctx, (await params).id, f);
}
