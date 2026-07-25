"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createQuizSchema, updateQuizSchema } from "@/lib/schemas/quiz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createQuiz(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const raw = {
    title: formData.get("title") as string,
    slug: formData.get("slug") as string,
    description: (formData.get("description") as string) || undefined,
  };

  const parsed = createQuizSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // Get user's org_id from profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as unknown as { org_id: string })?.org_id;
  if (!orgId) {
    return { error: { _form: ["No organization found for user"] } };
  }

  // Create quiz
  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({
      org_id: orgId,
      title: parsed.data.title,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      created_by: user.id,
    } as never)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: { slug: ["This slug is already taken"] } };
    }
    return { error: { _form: [error.message] } };
  }

  const quizId = (quiz as unknown as { id: string }).id;

  // Create first draft version
  await supabase.from("quiz_versions").insert({
    org_id: orgId,
    quiz_id: quizId,
    version: 1,
    status: "draft",
    created_by: user.id,
  } as never);

  revalidatePath("/admin/quizzes");
  redirect(`/admin/quizzes/${quizId}/edit`);
}

export async function updateQuiz(quizId: string, formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const raw = {
    title: formData.get("title") as string | undefined,
    slug: formData.get("slug") as string | undefined,
    description: formData.get("description") as string | undefined,
  };

  // Filter out undefined/empty values
  const cleanRaw = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== "")
  );

  const parsed = updateQuizSchema.safeParse(cleanRaw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("quizzes")
    .update(parsed.data as never)
    .eq("id", quizId);

  if (error) {
    return { error: { _form: [error.message] } };
  }

  revalidatePath("/admin/quizzes");
  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  return { success: true };
}

export async function deleteQuiz(quizId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("quizzes").delete().eq("id", quizId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/quizzes");
  redirect("/admin/quizzes");
}
