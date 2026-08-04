"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

type NewUserRole = "owner" | "admin";

function generateInitialPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;

  const bytes = randomBytes(12);
  const chars = [
    upper[bytes[0]! % upper.length]!,
    lower[bytes[1]! % lower.length]!,
    digits[bytes[2]! % digits.length]!,
  ];
  for (let i = 3; i < 12; i++) {
    chars.push(all[bytes[i]! % all.length]!);
  }

  // Fisher-Yates shuffle
  const shuffleBytes = randomBytes(12);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffleBytes[i]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

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

export async function createUser(payload: {
  email: string;
  fullName: string;
  role: NewUserRole;
}) {
  const caller = await getCallerProfile();
  if ("error" in caller) return { error: caller.error };

  // Only super admins (owners) can create users
  if (caller.profile.role !== "owner") {
    return { error: "Only super admins can add new users" };
  }

  const email = payload.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Invalid email address" };
  }
  if (!payload.fullName.trim()) {
    return { error: "Full name is required" };
  }
  if (payload.role !== "owner" && payload.role !== "admin") {
    return { error: "Invalid role" };
  }

  const initialPassword = generateInitialPassword();
  const admin = createAdminClient();

  // 1. Create auth user with the initial password
  const { data: authUser, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
    });

  if (authError) {
    return { error: authError.message };
  }

  // 2. Create profile in the same org
  const { error: profileError } = await admin.from("profiles").insert({
    id: authUser.user.id,
    org_id: caller.profile.org_id,
    email,
    full_name: payload.fullName.trim(),
    role: payload.role,
  } as never);

  if (profileError) {
    // Roll back the auth user so we don't leave orphans
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { error: profileError.message };
  }

  return { success: true, initialPassword };
}

export async function updateOwnPassword(newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) return { error: error.message };

  return { success: true };
}
