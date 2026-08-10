import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

type ApiKeyRow = Database["public"]["Tables"]["api_keys"]["Row"];

export function mintApiKey(env: "live" | "test") {
  const secret = randomBytes(32).toString("base64url");
  const prefix = randomBytes(4).toString("hex");
  const raw = `qz_${env}_${prefix}_${secret}`;
  const hash = createHash("sha256").update(raw).digest();
  return { raw, prefix: `qz_${env}_${prefix}`, hash };
}

export function hashApiKey(raw: string): Buffer {
  return createHash("sha256").update(raw).digest();
}

export interface ApiKeyContext {
  orgId: string;
  apiKeyId: string;
  scopes: string[];
  quizIds: string[] | null;
}

export async function verifyApiKey(
  authHeader: string | null
): Promise<ApiKeyContext | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const raw = authHeader.slice(7);
  if (!raw.startsWith("qz_")) {
    return null;
  }

  const parts = raw.split("_");
  if (parts.length < 4) {
    return null;
  }

  const keyPrefix = `qz_${parts[1]}_${parts[2]}`;
  const keyHash = hashApiKey(raw);

  const supabase = createAdminClient();
  const { data: keys } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_prefix", keyPrefix)
    .is("revoked_at", null)
    .limit(5);

  const rows = (keys || []) as unknown as ApiKeyRow[];
  if (rows.length === 0) {
    return null;
  }

  for (const key of rows) {
    // PostgREST returns bytea as "\x<hex>"
    const storedHash = Buffer.from(
      key.key_hash.replace(/^\\x/, ""),
      "hex"
    );
    if (
      storedHash.length === keyHash.length &&
      timingSafeEqual(storedHash, keyHash)
    ) {
      if (key.expires_at && new Date(key.expires_at) < new Date()) {
        return null;
      }

      // Update last_used_at (fire and forget)
      supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() } as never)
        .eq("id", key.id)
        .then();

      return {
        orgId: key.org_id,
        apiKeyId: key.id,
        scopes: key.scopes,
        quizIds: key.quiz_ids,
      };
    }
  }

  return null;
}
