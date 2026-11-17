import { NextRequest, NextResponse } from "next/server";
import { accessCookieName, hasAccess } from "@/lib/scoreboard/access";
import { availability, loadPublicScoreboard, loadScoreboardBySlug } from "@/lib/scoreboard/data";

/** GET /api/public/scoreboards/{slug} — scoreboard data for the public page's live refresh. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const board = await loadScoreboardBySlug(slug);
  if (!board) return NextResponse.json({ error: "Scoreboard not found" }, { status: 404 });

  const state = availability(board);
  if (state !== "open") return NextResponse.json({ error: "Scoreboard unavailable", state }, { status: state === "inactive" ? 404 : 403 });

  if (!hasAccess(board.id, board.passcode_hash, request.cookies.get(accessCookieName(board.id))?.value)) {
    return NextResponse.json({ error: "Passcode required" }, { status: 401 });
  }

  const data = await loadPublicScoreboard(board);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
