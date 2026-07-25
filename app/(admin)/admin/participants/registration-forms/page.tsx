import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { RegistrationFormsClient } from "./client";

export default async function RegistrationFormsPage() {
  const authClient = await createServerSupabaseClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) notFound();

  const supabase = createAdminClient();

  // Get user org
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as unknown as { org_id: string })?.org_id;
  if (!orgId) notFound();

  const { data: forms } = await supabase
    .from("registration_forms")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  // Get quizzes for the dropdown
  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("org_id", orgId)
    .order("title");

  // Get competition sessions for the dropdown
  const { data: compSessions } = await supabase
    .from("competition_sessions")
    .select("id, title")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("title");

  return (
    <RegistrationFormsClient
      forms={(forms ?? []) as unknown as FormRow[]}
      quizzes={(quizzes ?? []) as unknown as Array<{ id: string; title: string }>}
      competitionSessions={(compSessions ?? []) as unknown as Array<{ id: string; title: string }>}
    />
  );
}

interface FormRow {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  require_passcode: boolean;
  passcode: string | null;
  fields: string[];
  quiz_id: string | null;
  competition_session_id: string | null;
  max_registrations: number | null;
  closes_at: string | null;
  created_at: string;
  updated_at: string;
}
