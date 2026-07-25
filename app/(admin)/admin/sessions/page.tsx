import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { SessionsClient } from "./sessions-client";

export default async function SessionsPage() {
  const authClient = await createServerSupabaseClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as unknown as { org_id: string })?.org_id;
  if (!orgId) notFound();

  // Fetch sessions
  const { data: sessions } = await admin
    .from("competition_sessions")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  // Fetch quiz sets for all sessions
  const sessionIds = (sessions ?? []).map((s: Record<string, unknown>) => s.id as string);
  let quizSets: Record<string, unknown>[] = [];
  if (sessionIds.length > 0) {
    const { data } = await admin
      .from("session_quiz_sets")
      .select("*, quiz_version:quiz_versions(id, version, quiz:quizzes(id, title))")
      .in("competition_session_id", sessionIds)
      .order("position");
    quizSets = (data ?? []) as Record<string, unknown>[];
  }

  // Fetch available quizzes with published versions for assignment
  const { data: quizVersions } = await admin
    .from("quiz_versions")
    .select("id, version, status, quiz:quizzes(id, title)")
    .eq("org_id", orgId)
    .order("version", { ascending: false });

  // Count participants per session
  const participantCounts: Record<string, number> = {};
  if (sessionIds.length > 0) {
    for (const sid of sessionIds) {
      const { count } = await admin
        .from("participants")
        .select("*", { count: "exact", head: true })
        .eq("competition_session_id", sid);
      participantCounts[sid] = count ?? 0;
    }
  }

  return (
    <SessionsClient
      sessions={(sessions ?? []) as never[]}
      quizSets={quizSets as never[]}
      quizVersions={(quizVersions ?? []) as never[]}
      participantCounts={participantCounts}
    />
  );
}
