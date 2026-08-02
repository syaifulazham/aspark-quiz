import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

interface PresignOptions {
  orgId: string;
  quizId: string;
  questionId: string;
  contentType: string;
  extension: string;
}

export async function generatePresignedUploadUrl(opts: PresignOptions) {
  const key = `org/${opts.orgId}/quiz/${opts.quizId}/q/${opts.questionId}/original.${opts.extension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: opts.contentType,
  });

  const uploadUrl = await getSignedUrl(R2, command, { expiresIn: 300 }); // 5 min

  return {
    uploadUrl,
    key,
    publicUrl: `https://${PUBLIC_HOST}/${key}`,
  };
}

export function getPublicUrl(key: string) {
  return `https://${PUBLIC_HOST}/${key}`;
}
