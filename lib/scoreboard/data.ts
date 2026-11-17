import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE = 1000;

export interface ScoreboardRow {
  id: string;
  org_id: string;
  competition_session_id: string;
  title: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  passcode_hash: string | null;
  top_n: number;
  countries: string[];
  quiz_version_ids: string[];
  auto_refresh: boolean;
  opens_at: string | null;
  closes_at: string | null;
}

export type Availability = "open" | "inactive" | "not_open" | "closed";

/** What the public page and API return. Never includes personal IDs or contact details. */
export interface PublicScoreboard {
  title: string;
  description: string | null;
  session: { title: string };
  countries: string[];
  topN: number;
  autoRefresh: boolean;
  generatedAt: string;
  totals: { participants: number; submissions: number; quizzes: number };
  quizzes: Array<{
    key: string;
    label: string;
    participants: number;
    entries: Array<{
      key: string;
      rank: number;
      name: string;
      school: string | null;
      country: string | null;
      grade: string | null;
      percentage: number;
      raw: number;
      max: number;
      durationMs: number | null;
    }>;
  }>;
}

export async function loadScoreboardBySlug(slug: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("public_scoreboards")
    .select(
      "id, org_id, competition_session_id, title, slug, description, is_active, passcode_hash, top_n, countries, quiz_version_ids, auto_refresh, opens_at, closes_at"
    )
    .eq("slug", slug)
    .maybeSingle();
  return (data as unknown as ScoreboardRow | null) ?? null;
}

export function availability(b: ScoreboardRow, now = new Date()): Availability {
  if (!b.is_active) return "inactive";
  if (b.opens_at && new Date(b.opens_at) > now) return "not_open";
  if (b.closes_at && new Date(b.closes_at) < now) return "closed";
  return "open";
}

interface AttemptRow {
  participant_id: string;
  quiz_version_id: string;
  raw_score: number | string | null;
  max_score: number | string | null;
  percentage: number | string | null;
  duration_ms: number | null;
  participants: { full_name: string; school: string | null; nationality: string | null; grade: string | null } | null;
}

const num = (v: number | string | null) => (v == null ? 0 : Number(v));

/** Best attempt wins: higher score, then faster — the same rule as Top Scorers and the xlsx export. */
function better(a: AttemptRow, b: AttemptRow) {
  const d = num(a.raw_score) - num(b.raw_score);
  if (d !== 0) return d > 0;
  return (a.duration_ms ?? Number.MAX_SAFE_INTEGER) < (b.duration_ms ?? Number.MAX_SAFE_INTEGER);
}

export async function loadPublicScoreboard(b: ScoreboardRow): Promise<PublicScoreboard> {
  const db = createAdminClient();

  const [{ data: session }, { data: setRows }] = await Promise.all([
    db.from("competition_sessions").select("title").eq("id", b.competition_session_id).eq("org_id", b.org_id).maybeSingle(),
    db
      .from("session_quiz_sets")
      .select("quiz_version_id, label, position, quiz_version:quiz_versions!inner(version, quiz:quizzes(title))")
      .eq("competition_session_id", b.competition_session_id)
      .order("position", { ascending: true }),
  ]);

  let quizzes = ((setRows ?? []) as unknown as Array<{
    quiz_version_id: string;
    label: string | null;
    quiz_version: { version: number; quiz: { title: string } | null };
  }>).map((s) => ({ id: s.quiz_version_id, label: s.label || s.quiz_version.quiz?.title || "Quiz" }));
  if (b.quiz_version_ids.length) quizzes = quizzes.filter((q) => b.quiz_version_ids.includes(q.id));
  const versionIds = quizzes.map((q) => q.id);

  const attempts: AttemptRow[] = [];
  if (versionIds.length) {
    for (let from = 0; ; from += PAGE) {
      let q = db
        .from("quiz_sessions")
        .select(
          "id, participant_id, quiz_version_id, raw_score, max_score, percentage, duration_ms, participants!inner(full_name, school, nationality, grade), session_tokens!inner(competition_session_id)"
        )
        .eq("org_id", b.org_id)
        .eq("state", "submitted")
        .eq("session_tokens.competition_session_id", b.competition_session_id)
        .in("quiz_version_id", versionIds)
        .order("id")
        .range(from, from + PAGE - 1);
      if (b.countries.length) q = q.in("participants.nationality", b.countries);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const batch = (data ?? []) as unknown as AttemptRow[];
      attempts.push(...batch);
      if (batch.length < PAGE) break;
    }
  }

  const best = new Map<string, Map<string, AttemptRow>>();
  for (const a of attempts) {
    const per = best.get(a.quiz_version_id) ?? new Map<string, AttemptRow>();
    const prev = per.get(a.participant_id);
    if (!prev || better(a, prev)) per.set(a.participant_id, a);
    best.set(a.quiz_version_id, per);
  }

  const out = quizzes.map((q) => {
    const ranked = [...(best.get(q.id)?.entries() ?? [])].sort(([, x], [, y]) =>
      better(x, y) ? -1 : better(y, x) ? 1 : 0
    );
    return {
      key: q.id,
      label: q.label,
      participants: ranked.length,
      entries: ranked.slice(0, b.top_n).map(([pid, a], i) => ({
        // Stable per board for animations, without exposing the internal participant id
        key: createHash("sha256").update(`${b.id}:${pid}`).digest("base64url").slice(0, 12),
        rank: i + 1,
        name: a.participants?.full_name ?? "—",
        school: a.participants?.school ?? null,
        country: a.participants?.nationality ?? null,
        grade: a.participants?.grade ?? null,
        percentage: Math.round(num(a.percentage) * 100) / 100,
        raw: num(a.raw_score),
        max: num(a.max_score),
        durationMs: a.duration_ms,
      })),
    };
  });

  return {
    title: b.title,
    description: b.description,
    session: { title: (session as unknown as { title: string } | null)?.title ?? "" },
    countries: b.countries,
    topN: b.top_n,
    autoRefresh: b.auto_refresh,
    generatedAt: new Date().toISOString(),
    totals: {
      participants: new Set(attempts.map((a) => a.participant_id)).size,
      submissions: out.reduce((n, q) => n + q.participants, 0),
      quizzes: out.length,
    },
    quizzes: out,
  };
}
