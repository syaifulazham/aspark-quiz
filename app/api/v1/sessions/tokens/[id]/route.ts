import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

interface TokenRow {
  id: string;
  token_prefix: string;
  participant_id: string;
  quiz_version_id: string;
  competition_session_id: string | null;
  mode: string;
  not_before: string | null;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_ip: string | null;
  revoked_at: string | null;
  created_at: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/unauthorized", title: "Unauthorized", status: 401, detail: "Missing, malformed, revoked or expired API key." },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("tokens:read") && !ctx.scopes.includes("tokens:write")) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/forbidden", title: "Forbidden", status: 403, detail: "API key lacks tokens:read scope." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: rawToken } = await supabase
    .from("session_tokens")
    .select(
      "id, token_prefix, participant_id, quiz_version_id, competition_session_id, mode, not_before, expires_at, redeemed_at, redeemed_ip, revoked_at, created_at"
    )
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .single();

  const token = rawToken as unknown as TokenRow | null;
  if (!token) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/not_found", title: "Token not found", status: 404, detail: "No token with this id in this organisation." },
      { status: 404 }
    );
  }

  // Derive status
  const now = new Date();
  let status: "active" | "not_yet_valid" | "redeemed" | "expired" | "revoked";
  if (token.revoked_at) {
    status = "revoked";
  } else if (token.redeemed_at) {
    status = "redeemed";
  } else if (new Date(token.expires_at) < now) {
    status = "expired";
  } else if (token.not_before && new Date(token.not_before) > now) {
    status = "not_yet_valid";
  } else {
    status = "active";
  }

  // Participant
  const { data: participant } = await supabase
    .from("participants")
    .select("id, personal_id, full_name")
    .eq("id", token.participant_id)
    .single();

  // Quiz / version
  const { data: quizVersion } = await supabase
    .from("quiz_versions")
    .select("version, quiz_id, quizzes(id, title)")
    .eq("id", token.quiz_version_id)
    .single();

  const qv = quizVersion as unknown as {
    version: number;
    quiz_id: string;
    quizzes: { id: string; title: string } | null;
  } | null;

  // Linked quiz session (created on redeem)
  const { data: quizSession } = await supabase
    .from("quiz_sessions")
    .select("id, state, started_at, deadline_at, submitted_at, raw_score, max_score, percentage, passed")
    .eq("token_id", token.id)
    .maybeSingle();

  const session = quizSession as unknown as {
    id: string;
    state: string;
    started_at: string | null;
    deadline_at: string | null;
    submitted_at: string | null;
    raw_score: number | null;
    max_score: number | null;
    percentage: number | null;
    passed: boolean | null;
  } | null;

  return NextResponse.json({
    token_id: token.id,
    token_prefix: token.token_prefix,
    status,
    mode: token.mode,
    participant: participant as unknown,
    quiz: qv
      ? { id: qv.quiz_id, title: qv.quizzes?.title ?? null, version: qv.version }
      : null,
    competition_session_id: token.competition_session_id,
    not_before: token.not_before,
    expires_at: token.expires_at,
    redeemed_at: token.redeemed_at,
    revoked_at: token.revoked_at,
    created_at: token.created_at,
    session: session
      ? {
          session_id: session.id,
          state: session.state,
          started_at: session.started_at,
          deadline_at: session.deadline_at,
          submitted_at: session.submitted_at,
          raw_score: session.raw_score,
          max_score: session.max_score,
          percentage: session.percentage,
          passed: session.passed,
        }
      : null,
  });
}
