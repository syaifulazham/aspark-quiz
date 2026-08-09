import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET!;
const PUBLIC_HOST = process.env.NEXT_PUBLIC_R2_PUBLIC_HOST!;

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

  const formData = await request.formData();
  const file = formData.get("file");
  const quizId = formData.get("quizId") as string | null;
  const questionId = formData.get("questionId") as string | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!quizId || !questionId) {
    return NextResponse.json(
      { error: "quizId and questionId are required" },
      { status: 400 }
    );
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum 10 MB." },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as unknown as { org_id: string })?.org_id;
  if (!orgId) {
    return NextResponse.json({ error: "No organization found" }, { status: 403 });
  }

  const extensionMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  const extension = extensionMap[file.type] || "bin";
  const key = `org/${orgId}/quiz/${quizId}/q/${questionId}/${randomUUID()}.${extension}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await R2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: file.type,
      Body: buffer,
    })
  );

  return NextResponse.json({
    key,
    publicUrl: `https://${PUBLIC_HOST}/${key}`,
  });
}
