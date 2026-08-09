import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { PreviewClient } from "./preview-client";
import type { RunnerQuestion, RunnerOption } from "@/components/runner";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PreviewPage({ params }: Props) {
  const { id } = await params;
  const authClient = await createServerSupabaseClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) notFound();

  const supabase = createAdminClient();

  // Fetch quiz
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, slug")
    .eq("id", id)
    .single();

  if (!quiz) notFound();

  // Get latest version (prefer published, fallback to draft)
  const { data: versions } = await supabase
    .from("quiz_versions")
    .select("id, version, status, time_limit_seconds, per_question_seconds, shuffle_questions, shuffle_options")
    .eq("quiz_id", id)
    .order("version", { ascending: false });

  const allVersions = (versions ?? []) as unknown as Array<{
    id: string;
    version: number;
    status: string;
    time_limit_seconds: number | null;
    per_question_seconds: number | null;
    shuffle_questions: boolean;
    shuffle_options: boolean;
  }>;

  const version = allVersions.find((v) => v.status === "published") ?? allVersions[0];
  if (!version) notFound();

  // Fetch questions with options
  const { data: rawQuestions } = await supabase
    .from("questions")
    .select("id, kind, content_kind, stem, points, time_seconds, numeric_answer, numeric_tolerance, numeric_unit, explanation, media_key, media_alt, position, question_options(id, label, is_correct, position, media_key, media_alt)")
    .eq("quiz_version_id", version.id)
    .order("position", { ascending: true });

  const questions: RunnerQuestion[] = ((rawQuestions ?? []) as unknown as Array<{
    id: string;
    kind: "mcq_single" | "true_false" | "numeric";
    content_kind: "text" | "image" | "text_image";
    stem: { text?: string };
    points: number;
    time_seconds: number | null;
    numeric_answer: number | null;
    numeric_tolerance: number;
    numeric_unit: string | null;
    explanation: { text?: string } | null;
    media_key: string | null;
    media_alt: string | null;
    position: number;
    question_options: Array<{
      id: string;
      label: { text?: string };
      is_correct: boolean;
      position: number;
      media_key: string | null;
      media_alt: string | null;
    }>;
  }>).map((q) => ({
    ...q,
    options: (q.question_options || []) as RunnerOption[],
  }));

  return (
    <PreviewClient
      quiz={quiz as unknown as { id: string; title: string; slug: string }}
      version={version}
      questions={questions}
    />
  );
}
