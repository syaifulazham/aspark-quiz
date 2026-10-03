import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { mintSessionToken, isUniqueViolation } from "@/lib/auth/session-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueTokenSchema } from "@/lib/schemas/token";
import { NO_SESSION_WARNING, resolveTokenTarget } from "@/lib/tokens/resolve-target";

export async function POST(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/unauthorized", title: "Unauthorized", status: 401, detail: "Missing, malformed, revoked or expired API key." },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("tokens:write")) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/forbidden", title: "Forbidden", status: 403, detail: "API key lacks tokens:write scope." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = issueTokenSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        type: "https://docs.quizzly.app/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "Request body failed schema validation.",
        errors: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          code: i.code,
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const input = parsed.data;

  // Resolve participant
  let participantId = input.participant_id;
  if (!participantId && input.personal_id) {
    const { data: participant } = await supabase
      .from("participants")
      .select("id")
      .eq("org_id", ctx.orgId)
      .ilike("personal_id", input.personal_id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { type: "https://docs.quizzly.app/errors/not_found", title: "Participant not found", status: 404, detail: `No participant with personal_id '${input.personal_id}' in this organisation.` },
        { status: 404 }
      );
    }
    participantId = (participant as unknown as { id: string }).id;
  }

  if (!participantId) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/validation", title: "Validation failed", status: 400, detail: "Either participant_id or personal_id is required." },
      { status: 400 }
    );
  }

  // Resolve which quiz version (and session) this code is for
  const resolved = await resolveTokenTarget(supabase, ctx.orgId, {
    quizId: input.quiz_id,
    quizVersion: input.quiz_version,
    competitionSessionId: input.competition_session_id,
    sessionQuizSetId: input.session_quiz_set_id,
  });
  if ("error" in resolved) {
    const e = resolved.error;
    const type = e.status === 404 ? "not_found" : e.status === 400 ? "validation" : "unprocessable";
    return NextResponse.json(
      { type: `https://docs.quizzly.app/errors/${type}`, title: e.title, status: e.status, detail: e.detail, code: e.code },
      { status: e.status }
    );
  }
  const { quizId, quizVersionId, competitionSessionId, sessionSlug, sessionQuizSetId } = resolved.target;

  // Check quiz_ids scope
  if (ctx.quizIds && !ctx.quizIds.includes(quizId)) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/forbidden", title: "Forbidden", status: 403, detail: "This API key is not authorised for this quiz." },
      { status: 403 }
    );
  }

  // Mint token (6-digit numeric), retrying on the rare hash collision
  const expiresAt = new Date(Date.now() + input.expires_in * 1000).toISOString();
  let rawToken = "";
  let tokenRecord: unknown = null;
  let error: { message: string; code?: string } | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const minted = mintSessionToken();
    rawToken = minted.raw;

    const result = await supabase
      .from("session_tokens")
      .insert({
        org_id: ctx.orgId,
        participant_id: participantId,
        quiz_version_id: quizVersionId,
        api_key_id: ctx.apiKeyId,
        token_hash: minted.hash,
        token_prefix: minted.prefix,
        mode: input.mode,
        live_room_id: input.live_room_id || null,
        expires_at: expiresAt,
        not_before: input.not_before || null,
        competition_session_id: competitionSessionId,
      } as never)
      .select("id")
      .single();

    tokenRecord = result.data;
    error = result.error;

    if (!error || !isUniqueViolation(error)) break;
  }

  if (error) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/internal", title: "Internal error", status: 500, detail: error.message },
      { status: 500 }
    );
  }

  // Fetch participant and quiz info for the response
  const { data: participant } = await supabase
    .from("participants")
    .select("id, personal_id, full_name")
    .eq("id", participantId)
    .single();

  const { data: quizVersion } = await supabase
    .from("quiz_versions")
    .select("version, time_limit_seconds, quiz_id, quizzes(id, title)")
    .eq("id", quizVersionId)
    .single();

  const { count: questionCount } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("quiz_version_id", quizVersionId);

  const baseUrl = request.nextUrl.origin;
  const startUrl = sessionSlug
    ? `${baseUrl}/quiz/${sessionSlug}/${quizVersionId}?token=${rawToken}`
    : `${baseUrl}/play?pid=${encodeURIComponent((participant as unknown as { personal_id: string })?.personal_id || "")}&token=${rawToken}`;

  return NextResponse.json(
    {
      token: rawToken,
      token_id: (tokenRecord as unknown as { id: string })?.id,
      participant: participant,
      quiz: {
        id: quizId,
        title: (quizVersion as unknown as Record<string, unknown>)?.quizzes
          ? ((quizVersion as unknown as Record<string, unknown>).quizzes as Record<string, unknown>)?.title
          : null,
        version: (quizVersion as unknown as Record<string, unknown>)?.version,
        question_count: questionCount || 0,
        time_limit_seconds: (quizVersion as unknown as Record<string, unknown>)?.time_limit_seconds,
      },
      mode: input.mode,
      competition_session_id: competitionSessionId,
      session_quiz_set_id: sessionQuizSetId,
      start_url: startUrl,
      expires_at: expiresAt,
      not_before: input.not_before || null,
      single_use: true,
      ...(competitionSessionId ? {} : { warnings: [NO_SESSION_WARNING] }),
    },
    { status: 201 }
  );
}
