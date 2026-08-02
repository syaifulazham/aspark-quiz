import { config } from "dotenv";
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

config({ path: ".env" });

const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET!;

async function main() {
  await R2.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [
              "http://localhost:3000",
              "http://localhost:3010",
              "http://127.0.0.1:3000",
              "http://127.0.0.1:3010",
              "http://192.168.1.126:3010",
              // TODO: add your production domain(s) here
            ],
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );
  console.log(`CORS policy applied to bucket: ${BUCKET}`);
}

main().catch((err) => {
  console.error("Failed to set CORS:", err);
  process.exit(1);
});
