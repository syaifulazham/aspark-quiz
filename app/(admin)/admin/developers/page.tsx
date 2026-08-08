import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DevelopersClient } from "./developers-client";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  environment: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export default async function DevelopersPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  const caller = profile as unknown as { org_id: string; role: string } | null;
  if (!caller) {
    redirect("/admin/login");
  }

  const { data: keys } = await supabase
    .from("api_keys")
    .select(
      "id, name, key_prefix, environment, scopes, last_used_at, expires_at, revoked_at, created_at"
    )
    .eq("org_id", caller.org_id)
    .order("created_at", { ascending: false });

  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <DevelopersClient
      keys={(keys as unknown as ApiKeyRow[]) ?? []}
      canManage={caller.role === "owner" || caller.role === "admin"}
      origin={origin}
    />
  );
}
