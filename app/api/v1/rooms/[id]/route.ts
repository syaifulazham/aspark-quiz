import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { type: "unauthorized", title: "Invalid API key", status: 401 },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("rooms:write")) {
    return NextResponse.json(
      { type: "forbidden", title: "Insufficient scope", status: 403 },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();

  const { data: room, error } = await supabase
    .from("live_rooms")
    .select("*")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .single();

  if (error || !room) {
    return NextResponse.json(
      { type: "not_found", title: "Room not found", status: 404 },
      { status: 404 }
    );
  }

  const r = room as unknown as Record<string, unknown>;

  return NextResponse.json({
    id: r.id,
    code: r.code,
    state: r.state,
    current_index: r.current_index,
    started_at: r.started_at,
    ended_at: r.ended_at,
    created_at: r.created_at,
  });
}
