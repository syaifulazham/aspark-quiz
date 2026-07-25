/**
 * Seed script: Creates an admin user + organization + profile.
 *
 * Usage:
 *   pnpm tsx scripts/seed-admin.ts
 *
 * Environment variables required (from .env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Configuration ───────────────────────────────────────────────
const ADMIN_EMAIL = "admin@quizzly.app";
const ADMIN_PASSWORD = "admin123456";
const ORG_NAME = "Quizzly Demo Org";
// ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding admin user...\n");

  // 1. Create organization
  console.log(`  Creating organization: ${ORG_NAME}`);
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .upsert({ name: ORG_NAME, slug: "demo" }, { onConflict: "slug" })
    .select("id")
    .single();

  if (orgError) {
    console.error("  ❌ Failed to create organization:", orgError.message);
    process.exit(1);
  }
  console.log(`  ✅ Organization: ${org.id}`);

  // 2. Create auth user
  console.log(`  Creating auth user: ${ADMIN_EMAIL}`);
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  let userId: string;

  if (authError) {
    if (authError.message.includes("already been registered")) {
      console.log("  ⚠️  User already exists, fetching...");
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const existing = users.find((u) => u.email === ADMIN_EMAIL);
      if (!existing) {
        console.error("  ❌ Could not find existing user");
        process.exit(1);
      }
      userId = existing.id;
    } else {
      console.error("  ❌ Failed to create user:", authError.message);
      process.exit(1);
    }
  } else {
    userId = authUser.user.id;
  }
  console.log(`  ✅ Auth user: ${userId}`);

  // 3. Create profile
  console.log("  Creating profile...");
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        org_id: org.id,
        role: "owner",
        email: ADMIN_EMAIL,
        full_name: "Admin",
      },
      { onConflict: "id" }
    );

  if (profileError) {
    console.error("  ❌ Failed to create profile:", profileError.message);
    process.exit(1);
  }
  console.log("  ✅ Profile created (role: owner)");

  console.log("\n─────────────────────────────────────────");
  console.log("  🎉 Seed complete!\n");
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log(`  Org ID:   ${org.id}`);
  console.log("─────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
