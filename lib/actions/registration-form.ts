"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

interface FormPayload {
  title: string;
  slug: string;
  description?: string | null;
  is_active?: boolean;
  require_passcode?: boolean;
  passcode?: string | null;
  fields?: string[];
  quiz_id?: string | null;
  competition_session_id?: string | null;
  max_registrations?: number | null;
  closes_at?: string | null;
}

export async function createRegistrationForm(payload: FormPayload) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();

  // Get org_id
  const { data: profile } = await adminClient
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as unknown as { org_id: string })?.org_id;
  if (!orgId) return { error: "No organization" };

  const { data, error } = await adminClient
    .from("registration_forms")
    .insert({
      org_id: orgId,
      title: payload.title,
      slug: payload.slug,
      description: payload.description || null,
      is_active: payload.is_active ?? true,
      require_passcode: payload.require_passcode ?? false,
      passcode: payload.require_passcode ? payload.passcode : null,
      fields: payload.fields || ["personal_id", "full_name", "email", "school"],
      quiz_id: payload.quiz_id || null,
      competition_session_id: payload.competition_session_id || null,
      max_registrations: payload.max_registrations || null,
      closes_at: payload.closes_at || null,
    } as never)
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/admin/participants");
  return { id: (data as unknown as { id: string }).id };
}

export async function updateRegistrationForm(formId: string, payload: Partial<FormPayload>) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();

  const updateData: Record<string, unknown> = { ...payload };
  if (payload.require_passcode === false) {
    updateData.passcode = null;
  }

  const { error } = await adminClient
    .from("registration_forms")
    .update(updateData as never)
    .eq("id", formId);

  if (error) return { error: error.message };

  revalidatePath("/admin/participants");
  return { success: true };
}

export async function deleteRegistrationForm(formId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("registration_forms")
    .delete()
    .eq("id", formId);

  if (error) return { error: error.message };

  revalidatePath("/admin/participants");
  return { success: true };
}

export async function toggleRegistrationForm(formId: string, isActive: boolean) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("registration_forms")
    .update({ is_active: isActive } as never)
    .eq("id", formId);

  if (error) return { error: error.message };

  revalidatePath("/admin/participants");
  return { success: true };
}
