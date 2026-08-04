"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

interface QuestionPayload {
  quiz_version_id: string;
  kind: "mcq_single" | "mcq_multi" | "true_false" | "numeric";
  content_kind?: "text" | "image" | "text_image";
  stem: Record<string, unknown>;
  points?: number;
  time_seconds?: number | null;
  numeric_answer?: number | null;
  numeric_tolerance?: number;
  numeric_unit?: string | null;
  explanation?: Record<string, unknown> | null;
  media_key?: string | null;
  media_alt?: string | null;
}

interface OptionPayload {
  question_id: string;
  label: Record<string, unknown>;
  is_correct: boolean;
  position?: number;
}

export async function addQuestion(quizId: string, payload: QuestionPayload) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  // Get org_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as unknown as { org_id: string })?.org_id;
  if (!orgId) return { error: "No organization" };

  // Get next position
  const { count } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("quiz_version_id", payload.quiz_version_id);

  const position = (count ?? 0) + 1;

  const { data: question, error } = await supabase
    .from("questions")
    .insert({
      org_id: orgId,
      quiz_version_id: payload.quiz_version_id,
      kind: payload.kind,
      content_kind: payload.content_kind || "text",
      stem: payload.stem,
      points: payload.points ?? 1,
      time_seconds: payload.time_seconds || null,
      numeric_answer: payload.numeric_answer || null,
      numeric_tolerance: payload.numeric_tolerance ?? 0,
      numeric_unit: payload.numeric_unit || null,
      explanation: payload.explanation || null,
      media_key: payload.media_key || null,
      media_alt: payload.media_alt || null,
      position,
    } as never)
    .select("id")
    .single();

  if (error) return { error: error.message };

  const questionId = (question as unknown as { id: string }).id;

  // For true_false, auto-create two options
  if (payload.kind === "true_false") {
    await supabase.from("question_options").insert([
      { org_id: orgId, question_id: questionId, label: { text: "True" }, is_correct: true, position: 1 },
      { org_id: orgId, question_id: questionId, label: { text: "False" }, is_correct: false, position: 2 },
    ] as never);
  }

  return { id: questionId };
}

export async function updateQuestion(
  quizId: string,
  questionId: string,
  payload: Partial<QuestionPayload>
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("questions")
    .update(payload as never)
    .eq("id", questionId);

  if (error) return { error: error.message };

  return { success: true };
}

export async function deleteQuestion(quizId: string, questionId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", questionId);

  if (error) return { error: error.message };

  return { success: true };
}

export async function reorderQuestions(
  quizId: string,
  versionId: string,
  orderedIds: string[]
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  // Update positions in a batch
  const updates = orderedIds.map((id, index) =>
    supabase
      .from("questions")
      .update({ position: index + 1 } as never)
      .eq("id", id)
      .eq("quiz_version_id", versionId)
  );

  await Promise.all(updates);

  return { success: true };
}

export async function addOption(quizId: string, payload: OptionPayload) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as unknown as { org_id: string })?.org_id;
  if (!orgId) return { error: "No organization" };

  // Use provided position, otherwise get next position
  let position = payload.position;
  if (!position) {
    const { count } = await supabase
      .from("question_options")
      .select("*", { count: "exact", head: true })
      .eq("question_id", payload.question_id);
    position = (count ?? 0) + 1;
  }

  const { data: option, error } = await supabase
    .from("question_options")
    .insert({
      org_id: orgId,
      question_id: payload.question_id,
      label: payload.label,
      is_correct: payload.is_correct,
      position,
    } as never)
    .select("id")
    .single();

  if (error) return { error: error.message };

  return { id: (option as unknown as { id: string }).id };
}

export async function updateOption(
  quizId: string,
  optionId: string,
  payload: Partial<{ label: Record<string, unknown>; is_correct: boolean; position: number }>
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("question_options")
    .update(payload as never)
    .eq("id", optionId);

  if (error) return { error: error.message };

  return { success: true };
}

export async function deleteOption(quizId: string, optionId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("question_options")
    .delete()
    .eq("id", optionId);

  if (error) return { error: error.message };

  return { success: true };
}
