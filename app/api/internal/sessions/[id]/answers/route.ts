import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionJwt } from "@/lib/auth/session-jwt";

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

  const body = await request.json();
  const { question_id, selected_option_id, numeric_response } = body;

  if (!question_id) {
    return NextResponse.json({ error: "question_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify session is active
  const { data: session } = await supabase
    .from("quiz_sessions")
    .select("id, state, org_id, deadline_at")
    .eq("id", id)
    .single();

  const s = session as unknown as { id: string; state: string; org_id: string; deadline_at: string | null } | null;
  if (!s || s.state !== "active") {
    return NextResponse.json({ error: "Session not active" }, { status: 409 });
  }

  // Check deadline
  if (s.deadline_at && new Date(s.deadline_at) < new Date()) {
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }

  const now = new Date().toISOString();

  // Upsert answer
  const { error } = await supabase
    .from("session_answers")
    .upsert({
      session_id: id,
      org_id: s.org_id,
      question_id,
      selected_option_id: selected_option_id || null,
      numeric_response: numeric_response ?? null,
      answered_at: now,
      points_awarded: 0, // Will be computed on submit
    } as never, { onConflict: "session_id,question_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update revision count
  await supabase.rpc("increment_revision_count" as never, {
    p_session_id: id,
    p_question_id: question_id,
  } as never).then(() => {});

  return NextResponse.json({ saved: true, answered_at: now });
}
