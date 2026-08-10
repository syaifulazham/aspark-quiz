import { createHash, randomInt } from "node:crypto";

export function mintSessionToken() {
  const raw = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const hash = createHash("sha256").update(raw).digest("base64");
  return { raw, hash, prefix: raw };
}

export function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}
