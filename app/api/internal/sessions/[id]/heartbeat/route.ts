import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionJwt, signSessionJwt } from "@/lib/auth/session-jwt";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify session JWT
  const token = request.cookies.get("qz_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const payload = await verifySessionJwt(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  if (payload.sub !== id) {
    return NextResponse.json({ error: "Session mismatch" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Update last_seen_at
  const now = new Date().toISOString();
  await supabase
    .from("quiz_sessions")
    .update({ last_seen_at: now } as never)
    .eq("id", id)
    .eq("state", "active");

  // Refresh JWT (sliding 15-min window)
  const newToken = await signSessionJwt({
    sub: id,
    aud: "play",
    org_id: payload.org_id,
    participant_id: payload.participant_id,
    quiz_version_id: payload.quiz_version_id,
  });

  const response = NextResponse.json({ ok: true, server_time: now });
  response.cookies.set("qz_session", newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 900, // 15 min
  });

  return response;
}
