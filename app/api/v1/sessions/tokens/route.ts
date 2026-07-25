import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueTokenSchema } from "@/lib/schemas/token";

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

  // Resolve quiz version
  let quizVersionId: string;
  if (input.quiz_version === "latest_published") {
    const { data: version } = await supabase
      .from("quiz_versions")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("quiz_id", input.quiz_id)
      .eq("status", "published")
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (!version) {
      return NextResponse.json(
        { type: "https://docs.quizzly.app/errors/unprocessable", title: "No published version", status: 422, detail: "This quiz has no published version." },
        { status: 422 }
      );
    }
    quizVersionId = (version as unknown as { id: string }).id;
  } else {
    const { data: version } = await supabase
      .from("quiz_versions")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("quiz_id", input.quiz_id)
      .eq("version", input.quiz_version)
      .eq("status", "published")
      .single();

    if (!version) {
      return NextResponse.json(
        { type: "https://docs.quizzly.app/errors/not_found", title: "Version not found", status: 404, detail: `Quiz version ${input.quiz_version} not found or not published.` },
        { status: 404 }
      );
    }
    quizVersionId = (version as unknown as { id: string }).id;
  }

  // Check quiz_ids scope
  if (ctx.quizIds && !ctx.quizIds.includes(input.quiz_id)) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/forbidden", title: "Forbidden", status: 403, detail: "This API key is not authorised for this quiz." },
      { status: 403 }
    );
  }

  // Mint token
  const rawToken = `qzt_${randomBytes(24).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("base64");
  const tokenPrefix = rawToken.slice(0, 12);
  const expiresAt = new Date(Date.now() + input.expires_in * 1000).toISOString();

  const { data: tokenRecord, error } = await supabase
    .from("session_tokens")
    .insert({
      org_id: ctx.orgId,
      participant_id: participantId,
      quiz_version_id: quizVersionId,
      api_key_id: ctx.apiKeyId,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      mode: input.mode,
      live_room_id: input.live_room_id || null,
      expires_at: expiresAt,
      not_before: input.not_before || null,
    } as never)
    .select("id")
    .single();

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

  return NextResponse.json(
    {
      token: rawToken,
      token_id: (tokenRecord as unknown as { id: string })?.id,
      participant: participant,
      quiz: {
        id: input.quiz_id,
        title: (quizVersion as unknown as Record<string, unknown>)?.quizzes
          ? ((quizVersion as unknown as Record<string, unknown>).quizzes as Record<string, unknown>)?.title
          : null,
        version: (quizVersion as unknown as Record<string, unknown>)?.version,
        question_count: questionCount || 0,
        time_limit_seconds: (quizVersion as unknown as Record<string, unknown>)?.time_limit_seconds,
      },
      mode: input.mode,
      start_url: `${baseUrl}/play?pid=${encodeURIComponent((participant as unknown as { personal_id: string })?.personal_id || "")}&token=${rawToken}`,
      expires_at: expiresAt,
      not_before: input.not_before || null,
      single_use: true,
    },
    { status: 201 }
  );
}
