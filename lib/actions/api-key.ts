"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mintApiKey } from "@/lib/auth/api-key";
import { AVAILABLE_SCOPES } from "@/lib/api-key-scopes";

async function getCallerProfile() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "No profile found" as const };

  return {
    user,
    profile: profile as unknown as { org_id: string; role: string },
  };
}

export async function createApiKey(payload: {
  name: string;
  environment: "live" | "test";
  scopes: string[];
  expiresAt?: string | null;
}) {
  const caller = await getCallerProfile();
  if ("error" in caller) return { error: caller.error };

  if (caller.profile.role !== "owner" && caller.profile.role !== "admin") {
    return { error: "Only admins can manage API keys" };
  }

  if (!payload.name.trim()) {
    return { error: "Name is required" };
  }
  if (payload.environment !== "live" && payload.environment !== "test") {
    return { error: "Invalid environment" };
  }
  const scopes = payload.scopes.filter((s) =>
    (AVAILABLE_SCOPES as readonly string[]).includes(s)
  );
  if (scopes.length === 0) {
    return { error: "Select at least one scope" };
  }

  const { raw, prefix, hash } = mintApiKey(payload.environment);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("api_keys")
    .insert({
      org_id: caller.profile.org_id,
      name: payload.name.trim(),
      key_hash: hash.toString("base64"),
      key_prefix: prefix,
      environment: payload.environment,
      scopes,
      expires_at: payload.expiresAt || null,
      created_by: caller.user.id,
    } as never)
    .select("id")
    .single();

  if (error) return { error: error.message };

  return {
    success: true,
    id: (data as unknown as { id: string }).id,
    key: raw,
  };
}

export async function revokeApiKey(keyId: string) {
  const caller = await getCallerProfile();
  if ("error" in caller) return { error: caller.error };

  if (caller.profile.role !== "owner" && caller.profile.role !== "admin") {
    return { error: "Only admins can manage API keys" };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() } as never)
    .eq("id", keyId)
    .eq("org_id", caller.profile.org_id)
    .is("revoked_at", null);

  if (error) return { error: error.message };

  return { success: true };
}
