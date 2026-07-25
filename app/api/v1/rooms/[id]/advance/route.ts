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

  // Get room
  const { data: room, error } = await supabase
    .from("live_rooms")
    .select("*")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .single();

  if (error || !room) {
    return NextResponse.json({ type: "not_found", title: "Room not found", status: 404 }, { status: 404 });
  }

  const r = room as unknown as { id: string; state: string; current_index: number; quiz_version_id: string };

  if (r.state === "finished") {
    return NextResponse.json({ type: "conflict", title: "Room already finished", status: 409 }, { status: 409 });
  }

  // Get question count
  const { count } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("quiz_version_id", r.quiz_version_id);

  const totalQuestions = count ?? 0;
  const nextIndex = r.current_index + 1;

  if (nextIndex >= totalQuestions) {
    return NextResponse.json({ type: "conflict", title: "No more questions", status: 409, detail: "Use /end to finish" }, { status: 409 });
  }

  // Advance
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    current_index: nextIndex,
    state: "question_open",
  };

  if (r.state === "lobby") {
    updates.started_at = now;
  }

  await supabase
    .from("live_rooms")
    .update(updates as never)
    .eq("id", id);

  // Create live_round entry
  const { data: questions } = await supabase
    .from("questions")
    .select("id")
    .eq("quiz_version_id", r.quiz_version_id)
    .order("position", { ascending: true })
    .range(nextIndex, nextIndex);

  const questionId = ((questions ?? []) as unknown as Array<{ id: string }>)[0]?.id;

  if (questionId) {
    await supabase.from("live_rounds").insert({
      room_id: id,
      question_id: questionId,
      round_index: nextIndex,
      opened_at: now,
    } as never);
  }

  return NextResponse.json({
    state: "question_open",
    current_index: nextIndex,
    total_questions: totalQuestions,
  });
}
