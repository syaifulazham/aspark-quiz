import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json({ type: "unauthorized", title: "Invalid API key", status: 401 }, { status: 401 });
  }
  if (!ctx.scopes.includes("rooms:write")) {
    return NextResponse.json({ type: "forbidden", title: "Insufficient scope", status: 403 }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: room, error } = await supabase
    .from("live_rooms")
    .select("id, state, current_index")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .single();

  if (error || !room) {
    return NextResponse.json({ type: "not_found", title: "Room not found", status: 404 }, { status: 404 });
  }

  const r = room as unknown as { id: string; state: string; current_index: number };

  if (r.state !== "question_open") {
    return NextResponse.json({ type: "conflict", title: "No open question to lock", status: 409 }, { status: 409 });
  }

  const now = new Date().toISOString();

  await supabase
    .from("live_rooms")
    .update({ state: "question_locked" } as never)
    .eq("id", id);

  // Update live_round
  await supabase
    .from("live_rounds")
    .update({ locked_at: now } as never)
    .eq("room_id", id)
    .eq("round_index", r.current_index);

  return NextResponse.json({ state: "question_locked", current_index: r.current_index });
}
