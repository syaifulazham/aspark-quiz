import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";

export async function GET(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/unauthorized", title: "Unauthorized", status: 401, detail: "Missing, malformed, revoked or expired API key." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    status: "ok",
    org_id: ctx.orgId,
    scopes: ctx.scopes,
    quiz_ids: ctx.quizIds,
  });
}
