"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

interface SessionPayload {
  title: string;
  slug: string;
  description?: string | null;
  session_type: "public" | "live_tournament" | "online_competition";
  is_active?: boolean;
  opens_at?: string | null;
  closes_at?: string | null;
}

interface QuizSetPayload {
  quiz_version_id: string;
  position: number;
  label?: string | null;
}

async function getOrgId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  return (profile as unknown as { org_id: string })?.org_id || null;
}

export async function createCompetitionSession(payload: SessionPayload) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("competition_sessions")
    .insert({
      org_id: orgId,
      title: payload.title,
      slug: payload.slug,
      description: payload.description || null,
      session_type: payload.session_type,
      is_active: payload.is_active ?? true,
      opens_at: payload.opens_at || null,
      closes_at: payload.closes_at || null,
      created_by: user?.id || null,
    } as never)
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  return { id: (data as unknown as { id: string }).id };
}

export async function updateCompetitionSession(sessionId: string, payload: Partial<SessionPayload>) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const admin = createAdminClient();
  const updateData: Record<string, unknown> = { ...payload, updated_at: new Date().toISOString() };

  const { error } = await admin
    .from("competition_sessions")
    .update(updateData as never)
    .eq("id", sessionId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  return { success: true };
}

export async function deleteCompetitionSession(sessionId: string) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("competition_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  return { success: true };
}

export async function setSessionQuizSets(sessionId: string, quizSets: QuizSetPayload[]) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("competition_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!session) return { error: "Session not found" };

  const wanted = quizSets.filter((qs) => qs.quiz_version_id);
  const versionIds = wanted.map((qs) => qs.quiz_version_id);

  // Validate everything up front so a bad request never touches existing rows
  const { data: versions } = versionIds.length
    ? await admin
        .from("quiz_versions")
        .select("id, version, quiz:quizzes(title)")
        .eq("org_id", orgId)
        .in("id", versionIds)
    : { data: [] };
  const versionName = new Map(
    ((versions ?? []) as unknown as Array<{ id: string; version: number; quiz: { title: string } | null }>).map(
      (v) => [v.id, `${v.quiz?.title ?? "Untitled quiz"} (v${v.version})`]
    )
  );

  const unknown = versionIds.filter((id) => !versionName.has(id));
  if (unknown.length) return { error: "One or more selected quizzes no longer exist." };

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of versionIds) (seen.has(id) ? duplicates : seen).add(id);
  if (duplicates.size) {
    const names = [...duplicates].map((id) => versionName.get(id)).join(", ");
    return { error: `Each quiz can only be added once. Remove the duplicate: ${names}.` };
  }

  // Upsert the wanted rows first (keeps ids and time limits of existing ones),
  // then remove the ones no longer selected. A failure here leaves the old list intact.
  if (wanted.length) {
    const { error } = await admin.from("session_quiz_sets").upsert(
      wanted.map((qs, i) => ({
        competition_session_id: sessionId,
        quiz_version_id: qs.quiz_version_id,
        position: i,
        label: qs.label?.trim() || null,
      })) as never[],
      { onConflict: "competition_session_id,quiz_version_id" }
    );
    if (error) return { error: error.message };
  }

  let removal = admin.from("session_quiz_sets").delete().eq("competition_session_id", sessionId);
  if (versionIds.length) removal = removal.not("quiz_version_id", "in", `(${versionIds.join(",")})`);
  const { error: removeError } = await removal;
  if (removeError) return { error: removeError.message };

  revalidatePath("/admin/sessions");
  return { success: true };
}

export async function updateQuizSetTimeLimit(
  quizSetId: string,
  timeLimitSeconds: number | null
) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  if (timeLimitSeconds !== null && (!Number.isFinite(timeLimitSeconds) || timeLimitSeconds <= 0)) {
    return { error: "Time limit must be a positive number of seconds" };
  }

  const admin = createAdminClient();

  // Verify the quiz set belongs to this org
  const { data: quizSet } = await admin
    .from("session_quiz_sets")
    .select("id, competition_session:competition_sessions!inner(org_id)")
    .eq("id", quizSetId)
    .single();

  const qs = quizSet as unknown as {
    id: string;
    competition_session: { org_id: string };
  } | null;

  if (!qs || qs.competition_session.org_id !== orgId) {
    return { error: "Quiz set not found" };
  }

  const { error } = await admin
    .from("session_quiz_sets")
    .update({ time_limit_seconds: timeLimitSeconds } as never)
    .eq("id", quizSetId);

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  return { success: true };
}

export async function toggleCompetitionSession(sessionId: string, isActive: boolean) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("competition_sessions")
    .update({ is_active: isActive, updated_at: new Date().toISOString() } as never)
    .eq("id", sessionId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  return { success: true };
}
