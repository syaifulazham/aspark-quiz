import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generatePresignedUploadUrl } from "@/lib/r2/presign";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { contentType, size, scope } = body;

  // Validate content type
  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate file size
  if (size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum 10 MB." },
      { status: 400 }
    );
  }

  // Validate scope
  if (!scope?.quizId || !scope?.questionId) {
    return NextResponse.json(
      { error: "scope.quizId and scope.questionId are required" },
      { status: 400 }
    );
  }

  // Get user's org_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as unknown as { org_id: string })?.org_id;
  if (!orgId) {
    return NextResponse.json({ error: "No organization found" }, { status: 403 });
  }

  // Determine extension from content type
  const extensionMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  const extension = extensionMap[contentType] || "bin";

  const result = await generatePresignedUploadUrl({
    orgId,
    quizId: scope.quizId,
    questionId: scope.questionId,
    contentType,
    extension,
  });

  return NextResponse.json(result);
}
