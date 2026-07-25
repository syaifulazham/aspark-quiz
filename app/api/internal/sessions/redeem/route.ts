import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { signSessionJwt } from "@/lib/auth/session-jwt";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

type TokenRow = Database["public"]["Tables"]["session_tokens"]["Row"];
type ParticipantRow = Database["public"]["Tables"]["participants"]["Row"];

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { personal_id, token } = body;

  if (!personal_id || !token) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/validation", title: "Validation failed", status: 400, detail: "personal_id and token are required." },
      { status: 400 }
    );
  }

  const tokenHash = createHash("sha256").update(token.trim()).digest("base64");
  const supabase = createAdminClient();

  // Look up token by hash
  const { data: rawToken } = await supabase
    .from("session_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .single();

  const tokenRecord = rawToken as TokenRow | null;

  if (!tokenRecord) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/invalid_credentials", title: "Invalid credentials", status: 401, detail: "That ID and token don't match a scheduled quiz." },
      { status: 401 }
    );
  }

  // Look up participant
  const { data: rawParticipant } = await supabase
    .from("participants")
    .select("*")
    .eq("id", tokenRecord.participant_id)
    .single();

  const participant = rawParticipant as ParticipantRow | null;

  if (!participant) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/invalid_credentials", title: "Invalid credentials", status: 401, detail: "That ID and token don't match a scheduled quiz." },
      { status: 401 }
    );
  }

  // Verify personal_id matches
  if (participant.personal_id.toLowerCase() !== personal_id.trim().toLowerCase()) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/invalid_credentials", title: "Invalid credentials", status: 401, detail: "That ID and token don't match a scheduled quiz." },
      { status: 401 }
    );
  }

  // Check if revoked
  if (tokenRecord.revoked_at) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/token_revoked", title: "Token revoked", status: 410, detail: "This token has been revoked. Contact your organiser." },
      { status: 410 }
    );
  }

  // Check if expired
  if (new Date(tokenRecord.expires_at) < new Date()) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/token_expired", title: "Token expired", status: 410, detail: "This token has expired. Contact your organiser for a new one." },
      { status: 410 }
    );
  }

  // Check not_before
  if (tokenRecord.not_before && new Date(tokenRecord.not_before) > new Date()) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/token_not_yet_valid", title: "Token not yet valid", status: 422, detail: `This token cannot be used before ${tokenRecord.not_before}.` },
      { status: 422 }
    );
  }

  // Check if already redeemed
  if (tokenRecord.redeemed_at) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/token_already_redeemed", title: "Token already redeemed", status: 409, detail: "This token has already been used. If you need to resume, reopen your quiz link." },
      { status: 409 }
    );
  }

  // Redeem: mark token and create session
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

  await supabase
    .from("session_tokens")
    .update({ redeemed_at: new Date().toISOString(), redeemed_ip: clientIp } as never)
    .eq("id", tokenRecord.id);

  // Get questions for shuffle
  const { data: questions } = await supabase
    .from("questions")
    .select("id")
    .eq("quiz_version_id", tokenRecord.quiz_version_id)
    .order("position", { ascending: true });

  const questionOrder = ((questions || []) as Array<{ id: string }>).map((q) => q.id);
  // TODO: implement shuffle based on quiz_version settings

  const { data: session, error: sessionError } = await supabase
    .from("quiz_sessions")
    .insert({
      org_id: tokenRecord.org_id,
      token_id: tokenRecord.id,
      participant_id: tokenRecord.participant_id,
      quiz_version_id: tokenRecord.quiz_version_id,
      mode: tokenRecord.mode,
      live_room_id: tokenRecord.live_room_id,
      state: "issued",
      question_order: questionOrder,
      user_agent: request.headers.get("user-agent") || null,
      ip_address: clientIp,
    } as never)
    .select("id")
    .single();

  if (sessionError) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/internal", title: "Internal error", status: 500, detail: sessionError.message },
      { status: 500 }
    );
  }

  const sessionId = (session as unknown as { id: string })?.id;

  // Sign session JWT
  const jwt = await signSessionJwt({
    sub: sessionId,
    aud: "play",
    org_id: tokenRecord.org_id,
    participant_id: tokenRecord.participant_id,
    quiz_version_id: tokenRecord.quiz_version_id,
  });

  // Set session cookie
  const cookieStore = await cookies();
  cookieStore.set("qz_session", jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours
  });

  return NextResponse.json({
    session_id: sessionId,
    participant: {
      id: participant.id,
      personal_id: participant.personal_id,
      full_name: participant.full_name,
    },
  });
}
