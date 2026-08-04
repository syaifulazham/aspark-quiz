import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { UsersClient } from "./users-client";

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

export default async function UsersPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  const profile = currentProfile as unknown as {
    org_id: string;
    role: string;
  } | null;

  if (!profile) {
    redirect("/admin/login");
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });

  return (
    <UsersClient
      users={(profiles as unknown as ProfileRow[]) ?? []}
      currentUserId={user.id}
      isSuperAdmin={profile.role === "owner"}
    />
  );
}
