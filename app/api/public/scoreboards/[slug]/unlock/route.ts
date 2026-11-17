import { NextRequest, NextResponse } from "next/server";
import { ACCESS_MAX_AGE, accessCookieName, accessToken, verifyPasscode } from "@/lib/scoreboard/access";
import { availability, loadScoreboardBySlug } from "@/lib/scoreboard/data";

/** POST /api/public/scoreboards/{slug}/unlock  { passcode } — sets the access cookie on success. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await request.json().catch(() => null)) as { passcode?: unknown } | null;
  const passcode = typeof body?.passcode === "string" ? body.passcode.trim() : "";

  const board = await loadScoreboardBySlug(slug);
  if (!board || availability(board) === "inactive") {
    return NextResponse.json({ error: "Scoreboard not found" }, { status: 404 });
  }
  if (!board.passcode_hash) return NextResponse.json({ ok: true });

  if (!passcode || !(await verifyPasscode(passcode, board.passcode_hash))) {
    // Slow down guessing
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(accessCookieName(board.id), accessToken(board.id, board.passcode_hash), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
  return res;
}
