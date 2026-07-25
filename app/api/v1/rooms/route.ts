import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "node:crypto";

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I,O,0,1 to avoid confusion
  let code = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i]! % chars.length];
  }
  return code;
}

export async function POST(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { type: "unauthorized", title: "Invalid API key", status: 401 },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("rooms:write")) {
    return NextResponse.json(
      { type: "forbidden", title: "Insufficient scope", status: 403, detail: "Requires rooms:write scope" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { quiz_id, quiz_version, settings } = body;

  if (!quiz_id) {
    return NextResponse.json(
      { type: "validation_error", title: "quiz_id is required", status: 400 },
      { status: 400 }
    );
  }

  // Check quiz_ids scope
  if (ctx.quizIds && !ctx.quizIds.includes(quiz_id)) {
    return NextResponse.json(
      { type: "forbidden", title: "Quiz not in key's allowlist", status: 403 },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();

  // Get version
  let versionId: string;
  if (quiz_version && quiz_version !== "latest_published") {
    const { data: v } = await supabase
      .from("quiz_versions")
      .select("id")
      .eq("quiz_id", quiz_id)
      .eq("version", quiz_version)
      .eq("status", "published")
      .single();
    if (!v) {
      return NextResponse.json(
        { type: "not_found", title: "Quiz version not found or not published", status: 404 },
        { status: 404 }
      );
    }
    versionId = (v as unknown as { id: string }).id;
  } else {
    const { data: versions } = await supabase
      .from("quiz_versions")
      .select("id")
      .eq("quiz_id", quiz_id)
      .eq("status", "published")
      .order("version", { ascending: false })
      .limit(1);
    const latest = ((versions ?? []) as unknown as Array<{ id: string }>)[0];
    if (!latest) {
      return NextResponse.json(
        { type: "not_found", title: "No published version found", status: 422 },
        { status: 422 }
      );
    }
    versionId = latest.id;
  }

  const code = generateRoomCode();

  const { data: room, error } = await supabase
    .from("live_rooms")
    .insert({
      org_id: ctx.orgId,
      quiz_version_id: versionId,
      code,
      state: "lobby",
      settings: settings || {},
    } as never)
    .select("id, code, state, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { type: "server_error", title: "Failed to create room", status: 500, detail: error.message },
      { status: 500 }
    );
  }

  const r = room as unknown as { id: string; code: string; state: string; created_at: string };
  const origin = request.nextUrl.origin;

  return NextResponse.json({
    id: r.id,
    code: r.code,
    state: r.state,
    join_url: `${origin}/live/${r.code}`,
    host_url: `${origin}/admin/live/${r.id}`,
    created_at: r.created_at,
  }, { status: 201 });
}
