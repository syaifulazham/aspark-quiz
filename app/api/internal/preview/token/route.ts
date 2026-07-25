import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SignJWT } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_JWT_SECRET || "preview-secret-change-me"
);

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quizId, versionId } = await request.json();

  if (!quizId || !versionId) {
    return NextResponse.json(
      { error: "quizId and versionId are required" },
      { status: 400 }
    );
  }

  // Generate a signed preview token (72h TTL)
  const token = await new SignJWT({
    type: "preview",
    quizId,
    versionId,
    createdBy: user.id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("72h")
    .sign(SECRET);

  const previewUrl = `${request.nextUrl.origin}/preview/${token}`;

  return NextResponse.json({ token, url: previewUrl, expiresIn: "72h" });
}
