"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPasscode } from "@/lib/scoreboard/access";

export interface ScoreboardPayload {
  title: string;
  slug: string;
  description?: string | null;
  competitionSessionId: string;
  topN: number;
  countries: string[];
  quizVersionIds: string[];
  autoRefresh: boolean;
  isActive: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
  /** keep = leave as is (edit only); set = new passcode; remove = no passcode */
  passcode: { mode: "keep" | "set" | "remove"; value?: string };
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function getCaller() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  const p = data as unknown as { org_id: string; role: string } | null;
  if (!p || (p.role !== "owner" && p.role !== "admin")) return null;
  return { userId: user.id, orgId: p.org_id };
}

async function validate(orgId: string, p: ScoreboardPayload) {
  const title = p.title.trim();
  const slug = p.slug.trim().toLowerCase();
  if (!title) return { error: "Title is required" };
  if (slug.length < 3 || slug.length > 64 || !SLUG.test(slug))
    return { error: "URL slug must be 3–64 characters: lowercase letters, numbers and single dashes" };
  if (!Number.isInteger(p.topN) || p.topN < 1 || p.topN > 100) return { error: "Top N must be between 1 and 100" };
  if (p.opensAt && p.closesAt && new Date(p.opensAt) >= new Date(p.closesAt))
    return { error: "Closing time must be after opening time" };
  if (p.passcode.mode === "set" && (p.passcode.value ?? "").trim().length < 4)
    return { error: "Passcode must be at least 4 characters" };

  const db = createAdminClient();
  const [{ data: session }, { data: sets }] = await Promise.all([
    db.from("competition_sessions").select("id").eq("id", p.competitionSessionId).eq("org_id", orgId).maybeSingle(),
    db.from("session_quiz_sets").select("quiz_version_id").eq("competition_session_id", p.competitionSessionId),
  ]);
  if (!session) return { error: "Session not found" };
  const inSession = new Set(((sets ?? []) as Array<{ quiz_version_id: string }>).map((s) => s.quiz_version_id));
  const quizVersionIds = [...new Set(p.quizVersionIds)].filter((id) => inSession.has(id));

  return {
    row: {
      title,
      slug,
      description: p.description?.trim() || null,
      competition_session_id: p.competitionSessionId,
      top_n: p.topN,
      countries: [...new Set(p.countries.map((c) => c.trim().toUpperCase()).filter(Boolean))].sort(),
      quiz_version_ids: quizVersionIds,
      auto_refresh: p.autoRefresh,
      is_active: p.isActive,
      opens_at: p.opensAt || null,
      closes_at: p.closesAt || null,
    },
  };
}

function friendly(error: { code?: string; message: string }) {
  if (error.code === "23505") return "That URL slug is already taken. Choose another.";
  return error.message;
}

export async function createScoreboard(p: ScoreboardPayload) {
  const caller = await getCaller();
  if (!caller) return { error: "Only owners and admins can manage public scoreboards" };
  const v = await validate(caller.orgId, p);
  if ("error" in v) return { error: v.error };

  const passcode_hash = p.passcode.mode === "set" ? await hashPasscode(p.passcode.value!.trim()) : null;
  const { data, error } = await createAdminClient()
    .from("public_scoreboards")
    .insert({ ...v.row, org_id: caller.orgId, passcode_hash, created_by: caller.userId } as never)
    .select("id")
    .single();
  if (error) return { error: friendly(error) };

  revalidatePath("/admin/results/public");
  return { success: true as const, id: (data as unknown as { id: string }).id };
}

export async function updateScoreboard(id: string, p: ScoreboardPayload) {
  const caller = await getCaller();
  if (!caller) return { error: "Only owners and admins can manage public scoreboards" };
  const v = await validate(caller.orgId, p);
  if ("error" in v) return { error: v.error };

  const update: Record<string, unknown> = { ...v.row, updated_at: new Date().toISOString() };
  if (p.passcode.mode === "set") update.passcode_hash = await hashPasscode(p.passcode.value!.trim());
  if (p.passcode.mode === "remove") update.passcode_hash = null;

  const { error } = await createAdminClient()
    .from("public_scoreboards")
    .update(update as never)
    .eq("id", id)
    .eq("org_id", caller.orgId);
  if (error) return { error: friendly(error) };

  revalidatePath("/admin/results/public");
  return { success: true as const };
}

export async function setScoreboardActive(id: string, isActive: boolean) {
  const caller = await getCaller();
  if (!caller) return { error: "Only owners and admins can manage public scoreboards" };
  const { error } = await createAdminClient()
    .from("public_scoreboards")
    .update({ is_active: isActive, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("org_id", caller.orgId);
  if (error) return { error: error.message };
  revalidatePath("/admin/results/public");
  return { success: true as const };
}

export async function deleteScoreboard(id: string) {
  const caller = await getCaller();
  if (!caller) return { error: "Only owners and admins can manage public scoreboards" };
  const { error } = await createAdminClient()
    .from("public_scoreboards")
    .delete()
    .eq("id", id)
    .eq("org_id", caller.orgId);
  if (error) return { error: error.message };
  revalidatePath("/admin/results/public");
  return { success: true as const };
}
