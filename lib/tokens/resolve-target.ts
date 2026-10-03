import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface TargetInput {
  quizId?: string | null;
  quizVersion?: "latest_published" | number;
  competitionSessionId?: string | null;
  sessionQuizSetId?: string | null;
}

export interface ResolvedTarget {
  quizId: string;
  quizVersionId: string;
  competitionSessionId: string | null;
  sessionSlug: string | null;
  sessionQuizSetId: string | null;
}

export interface TargetError {
  status: 400 | 404 | 422;
  code: string;
  title: string;
  detail: string;
}

interface SessionRow {
  id: string;
  slug: string;
}

interface SetRow {
  id: string;
  competition_session_id: string;
  quiz_version_id: string;
  quiz_version: { id: string; version: number; status: string; quiz_id: string } | null;
}

/** Per-request memo so batch calls look each session up once. */
export class TargetCache {
  sessions = new Map<string, Promise<SessionRow | null>>();
  sets = new Map<string, Promise<SetRow[]>>();
  latestPublished = new Map<string, Promise<{ id: string; version: number } | null>>();
}

const err = (status: TargetError["status"], code: string, title: string, detail: string) => ({
  error: { status, code, title, detail } satisfies TargetError,
});

function loadSession(db: Admin, orgId: string, id: string, cache: TargetCache) {
  let p = cache.sessions.get(id);
  if (!p) {
    p = (async () => {
      const { data } = await db
        .from("competition_sessions")
        .select("id, slug")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
      return (data as unknown as SessionRow | null) ?? null;
    })();
    cache.sessions.set(id, p);
  }
  return p;
}

function loadSets(db: Admin, sessionId: string, cache: TargetCache) {
  let p = cache.sets.get(sessionId);
  if (!p) {
    p = (async () => {
      const { data } = await db
        .from("session_quiz_sets")
        .select("id, competition_session_id, quiz_version_id, quiz_version:quiz_versions!inner(id, version, status, quiz_id)")
        .eq("competition_session_id", sessionId);
      return (data ?? []) as unknown as SetRow[];
    })();
    cache.sets.set(sessionId, p);
  }
  return p;
}

function loadLatestPublished(db: Admin, orgId: string, quizId: string, cache: TargetCache) {
  let p = cache.latestPublished.get(quizId);
  if (!p) {
    p = (async () => {
      const { data } = await db
        .from("quiz_versions")
        .select("id, version")
        .eq("org_id", orgId)
        .eq("quiz_id", quizId)
        .eq("status", "published")
        .order("version", { ascending: false })
        .limit(1);
      return ((data ?? []) as unknown as Array<{ id: string; version: number }>)[0] ?? null;
    })();
    cache.latestPublished.set(quizId, p);
  }
  return p;
}

/**
 * Work out exactly which quiz version — and, when given, which session — a login code is for.
 *
 * A quiz version can be reused by several competition sessions; the session is what makes a
 * "quiz in a session" unique. `session_quiz_set_id` names that pair directly. With
 * `competition_session_id` + `quiz_id`, the version is the one attached to that session, so
 * a code can never point at a version the session doesn't contain.
 */
export async function resolveTokenTarget(
  db: Admin,
  orgId: string,
  input: TargetInput,
  cache = new TargetCache()
): Promise<{ target: ResolvedTarget } | { error: TargetError }> {
  const quizVersion = input.quizVersion ?? "latest_published";

  if (input.sessionQuizSetId) {
    const { data } = await db
      .from("session_quiz_sets")
      .select("id, competition_session_id, quiz_version_id, quiz_version:quiz_versions!inner(id, version, status, quiz_id)")
      .eq("id", input.sessionQuizSetId)
      .maybeSingle();
    const set = data as unknown as SetRow | null;
    const session = set ? await loadSession(db, orgId, set.competition_session_id, cache) : null;
    if (!set || !set.quiz_version || !session) {
      return err(404, "not_found", "Session quiz not found", "No session quiz with this session_quiz_set_id in this organisation.");
    }
    if (input.competitionSessionId && input.competitionSessionId !== set.competition_session_id) {
      return err(422, "session_mismatch", "Session mismatch", "session_quiz_set_id belongs to a different competition_session_id.");
    }
    if (input.quizId && input.quizId !== set.quiz_version.quiz_id) {
      return err(422, "quiz_mismatch", "Quiz mismatch", "session_quiz_set_id refers to a different quiz_id.");
    }
    if (typeof quizVersion === "number" && quizVersion !== set.quiz_version.version) {
      return err(422, "version_mismatch", "Version mismatch", `This session uses version ${set.quiz_version.version} of the quiz, not ${quizVersion}.`);
    }
    if (set.quiz_version.status !== "published") {
      return err(422, "quiz_not_published", "Quiz version not published", "The quiz version in this session is not published.");
    }
    return {
      target: {
        quizId: set.quiz_version.quiz_id,
        quizVersionId: set.quiz_version_id,
        competitionSessionId: set.competition_session_id,
        sessionSlug: session.slug,
        sessionQuizSetId: set.id,
      },
    };
  }

  if (!input.quizId) {
    return err(400, "validation", "Validation failed", "Either quiz_id or session_quiz_set_id is required.");
  }
  const quizId = input.quizId;

  // Explicit version number: same lookup as before, then (if a session is given) it must be in it
  let quizVersionId: string | null = null;
  if (typeof quizVersion === "number") {
    const { data } = await db
      .from("quiz_versions")
      .select("id")
      .eq("org_id", orgId)
      .eq("quiz_id", quizId)
      .eq("version", quizVersion)
      .eq("status", "published")
      .maybeSingle();
    if (!data) {
      return err(404, "not_found", "Version not found", `Quiz version ${quizVersion} not found or not published.`);
    }
    quizVersionId = (data as unknown as { id: string }).id;
  }

  if (!input.competitionSessionId) {
    if (!quizVersionId) {
      const latest = await loadLatestPublished(db, orgId, quizId, cache);
      if (!latest) return err(422, "quiz_not_published", "No published version", "This quiz has no published version.");
      quizVersionId = latest.id;
    }
    return {
      target: { quizId, quizVersionId, competitionSessionId: null, sessionSlug: null, sessionQuizSetId: null },
    };
  }

  const session = await loadSession(db, orgId, input.competitionSessionId, cache);
  if (!session) {
    return err(404, "not_found", "Session not found", "No competition session with this id in this organisation.");
  }
  const sets = (await loadSets(db, session.id, cache)).filter((s) => s.quiz_version?.quiz_id === quizId);

  const match = quizVersionId
    ? sets.find((s) => s.quiz_version_id === quizVersionId)
    : sets
        .filter((s) => s.quiz_version?.status === "published")
        .sort((a, b) => b.quiz_version!.version - a.quiz_version!.version)[0];

  if (!match) {
    if (!quizVersionId && !(await loadLatestPublished(db, orgId, quizId, cache))) {
      return err(422, "quiz_not_published", "No published version", "This quiz has no published version.");
    }
    return err(422, "quiz_not_in_session", "Quiz not in session", "The resolved quiz version is not part of this competition session.");
  }

  return {
    target: {
      quizId,
      quizVersionId: match.quiz_version_id,
      competitionSessionId: session.id,
      sessionSlug: session.slug,
      sessionQuizSetId: match.id,
    },
  };
}

export const NO_SESSION_WARNING = {
  code: "no_competition_session",
  detail:
    "This code is not bound to a competition session, so its result will not appear in any session's results. Pass session_quiz_set_id (or competition_session_id) to bind it.",
} as const;
