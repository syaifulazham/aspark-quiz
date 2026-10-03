import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { mintSessionToken, isUniqueViolation } from "@/lib/auth/session-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { NO_SESSION_WARNING, TargetCache, resolveTokenTarget } from "@/lib/tokens/resolve-target";

export async function POST(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { type: "unauthorized", title: "Invalid API key", status: 401 },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("tokens:write")) {
    return NextResponse.json(
      { type: "forbidden", title: "Insufficient scope", status: 403, detail: "Requires tokens:write scope" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { tokens } = body;

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return NextResponse.json(
      { type: "validation_error", title: "tokens array is required", status: 400 },
      { status: 400 }
    );
  }

  if (tokens.length > 500) {
    return NextResponse.json(
      { type: "validation_error", title: "Maximum 500 tokens per batch", status: 400 },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const results: Array<{
    index: number;
    status: string;
    token?: string;
    token_id?: string;
    participant_id?: string;
    competition_session_id?: string | null;
    session_quiz_set_id?: string | null;
    start_url?: string;
    expires_at?: string;
    warnings?: Array<{ code: string; detail: string }>;
    error?: { code: string; detail: string };
  }> = [];

  let issued = 0;
  let failed = 0;

  // Participants must belong to the caller's organisation
  const participantIds = [...new Set(tokens.map((t: { participant_id?: unknown }) => t.participant_id).filter((v: unknown): v is string => typeof v === "string"))];
  const knownParticipants = new Set<string>();
  for (let i = 0; i < participantIds.length; i += 200) {
    const { data } = await supabase
      .from("participants")
      .select("id")
      .eq("org_id", ctx.orgId)
      .in("id", participantIds.slice(i, i + 200));
    for (const p of (data ?? []) as Array<{ id: string }>) knownParticipants.add(p.id);
  }

  const cache = new TargetCache();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (!t.participant_id || (!t.quiz_id && !t.session_quiz_set_id)) {
      failed++;
      results.push({ index: i, status: "failed", error: { code: "missing_required", detail: "participant_id and quiz_id (or session_quiz_set_id) required" } });
      continue;
    }

    if (!knownParticipants.has(t.participant_id)) {
      failed++;
      results.push({ index: i, status: "failed", participant_id: t.participant_id, error: { code: "participant_not_found", detail: "No participant with this id in this organisation" } });
      continue;
    }

    const resolved = await resolveTokenTarget(
      supabase,
      ctx.orgId,
      {
        quizId: t.quiz_id,
        competitionSessionId: t.competition_session_id,
        sessionQuizSetId: t.session_quiz_set_id,
      },
      cache
    );
    if ("error" in resolved) {
      failed++;
      results.push({ index: i, status: "failed", participant_id: t.participant_id, error: { code: resolved.error.code, detail: resolved.error.detail } });
      continue;
    }
    const target = resolved.target;
    const versionId = target.quizVersionId;

    // Check quiz_ids scope
    if (ctx.quizIds && !ctx.quizIds.includes(target.quizId)) {
      failed++;
      results.push({ index: i, status: "failed", error: { code: "forbidden", detail: "Quiz not in key's allowlist" } });
      continue;
    }

    const expiresIn = t.expires_in || 86400;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Generate token (6-digit numeric), retrying on the rare hash collision
    let rawToken = "";
    let tokenRow: unknown = null;
    let error: { message: string; code?: string } | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const minted = mintSessionToken();
      rawToken = minted.raw;

      const result = await supabase
        .from("session_tokens")
        .insert({
          org_id: ctx.orgId,
          participant_id: t.participant_id,
          quiz_version_id: versionId,
          api_key_id: ctx.apiKeyId,
          token_hash: minted.hash,
          token_prefix: minted.prefix,
          mode: t.mode || "solo",
          expires_at: expiresAt,
          not_before: t.not_before || null,
          competition_session_id: target.competitionSessionId,
        } as never)
        .select("id")
        .single();

      tokenRow = result.data;
      error = result.error;

      if (!error || !isUniqueViolation(error)) break;
    }

    if (error) {
      failed++;
      results.push({ index: i, status: "failed", participant_id: t.participant_id, error: { code: "db_error", detail: error.message } });
    } else {
      issued++;
      const origin = request.nextUrl.origin;
      results.push({
        index: i,
        status: "issued",
        token: rawToken,
        token_id: (tokenRow as unknown as { id: string }).id,
        participant_id: t.participant_id,
        competition_session_id: target.competitionSessionId,
        session_quiz_set_id: target.sessionQuizSetId,
        start_url: target.sessionSlug
          ? `${origin}/quiz/${target.sessionSlug}/${versionId}?token=${rawToken}`
          : `${origin}/play?pid=${encodeURIComponent(t.personal_id || t.participant_id)}&token=${rawToken}`,
        expires_at: expiresAt,
        ...(target.competitionSessionId ? {} : { warnings: [NO_SESSION_WARNING] }),
      });
    }
  }

  return NextResponse.json({ issued, failed, results }, { status: 207 });
}
