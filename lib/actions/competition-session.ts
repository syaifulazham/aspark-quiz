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

  // Capture existing time limits so they survive the delete/re-insert
  const { data: existingSets } = await admin
    .from("session_quiz_sets")
    .select("quiz_version_id, time_limit_seconds")
    .eq("competition_session_id", sessionId);

  const timeLimitByVersion = new Map<string, number | null>(
    ((existingSets ?? []) as unknown as Array<{
      quiz_version_id: string;
      time_limit_seconds: number | null;
    }>).map((row) => [row.quiz_version_id, row.time_limit_seconds])
  );

  // Delete existing quiz sets for this session
  await admin
    .from("session_quiz_sets")
    .delete()
    .eq("competition_session_id", sessionId);

  if (quizSets.length === 0) {
    revalidatePath("/admin/sessions");
    return { success: true };
  }

  // Insert new quiz sets
  const rows = quizSets.map((qs) => ({
    competition_session_id: sessionId,
    quiz_version_id: qs.quiz_version_id,
    position: qs.position,
    label: qs.label || null,
    time_limit_seconds: timeLimitByVersion.get(qs.quiz_version_id) ?? null,
  }));

  const { error } = await admin
    .from("session_quiz_sets")
    .insert(rows as never[]);

  if (error) return { error: error.message };

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
