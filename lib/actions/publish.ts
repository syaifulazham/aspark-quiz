"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface ValidationIssue {
  level: "error" | "warning";
  message: string;
  questionIndex?: number;
}

export async function validateAndPublish(quizId: string, versionId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  // Fetch version
  const { data: version } = await supabase
    .from("quiz_versions")
    .select("*")
    .eq("id", versionId)
    .single();

  const v = version as unknown as { status: string; passing_score: number | null } | null;
  if (!v || v.status !== "draft") {
    return { error: "Only draft versions can be published" };
  }

  // Fetch questions with options
  const { data: rawQuestions } = await supabase
    .from("questions")
    .select("*, question_options(*)")
    .eq("quiz_version_id", versionId)
    .order("position", { ascending: true });

  const questions = (rawQuestions ?? []) as unknown as Array<{
    id: string;
    kind: string;
    stem: { text?: string };
    numeric_answer: number | null;
    media_key: string | null;
    media_alt: string | null;
    points: number;
    position: number;
    question_options: Array<{
      id: string;
      is_correct: boolean;
      label: { text?: string };
    }>;
  }>;

  const issues: ValidationIssue[] = [];

  // 1. At least one question
  if (questions.length === 0) {
    issues.push({ level: "error", message: "Quiz must have at least 1 question" });
  }

  let totalPoints = 0;

  questions.forEach((q, i) => {
    totalPoints += q.points;

    // Check stem
    if (!q.stem?.text || q.stem.text.trim().length === 0) {
      issues.push({ level: "error", message: `Q${i + 1}: Empty question stem`, questionIndex: i });
    }

    // MCQ checks
    if (q.kind === "mcq_single" || q.kind === "true_false") {
      const options = q.question_options || [];
      if (options.length < 2) {
        issues.push({ level: "error", message: `Q${i + 1}: Must have at least 2 options`, questionIndex: i });
      }
      const correctCount = options.filter((o) => o.is_correct).length;
      if (correctCount !== 1) {
        issues.push({ level: "error", message: `Q${i + 1}: Must have exactly 1 correct option (found ${correctCount})`, questionIndex: i });
      }
    }

    // Numeric checks
    if (q.kind === "numeric" && q.numeric_answer === null) {
      issues.push({ level: "error", message: `Q${i + 1}: Numeric answer is required`, questionIndex: i });
    }

    // Media alt text
    if (q.media_key && !q.media_alt) {
      issues.push({ level: "error", message: `Q${i + 1}: Image missing alt text`, questionIndex: i });
    }
  });

  // Total points check
  if (totalPoints <= 0) {
    issues.push({ level: "error", message: "Total points must be greater than 0" });
  }

  // Passing score check
  if (v.passing_score !== null && v.passing_score > totalPoints) {
    issues.push({ level: "error", message: `Passing score (${v.passing_score}) exceeds total points (${totalPoints})` });
  }

  const errors = issues.filter((i) => i.level === "error");
  if (errors.length > 0) {
    return { issues, published: false };
  }

  // All clear — publish
  const { error } = await supabase
    .from("quiz_versions")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
    } as never)
    .eq("id", versionId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  revalidatePath("/admin/quizzes");
  return { issues, published: true, totalPoints };
}

export async function createNewVersion(quizId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  // Get latest version number
  const { data: versions } = await supabase
    .from("quiz_versions")
    .select("version")
    .eq("quiz_id", quizId)
    .order("version", { ascending: false })
    .limit(1);

  const latestVersion = ((versions ?? []) as unknown as Array<{ version: number }>)[0]?.version ?? 0;

  // Get user's org_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as unknown as { org_id: string })?.org_id;
  if (!orgId) return { error: "No organization found" };

  // Create new draft version
  const { data: newVersion, error } = await supabase
    .from("quiz_versions")
    .insert({
      org_id: orgId,
      quiz_id: quizId,
      version: latestVersion + 1,
      status: "draft",
      created_by: user.id,
    } as never)
    .select("id, version")
    .single();

  if (error) return { error: error.message };

  const nv = newVersion as unknown as { id: string; version: number };

  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  return { versionId: nv.id, version: nv.version };
}
