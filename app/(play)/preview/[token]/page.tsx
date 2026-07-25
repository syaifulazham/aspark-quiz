import { jwtVerify } from "jose";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PreviewClient } from "@/app/(admin)/admin/quizzes/[id]/preview/preview-client";
import type { RunnerQuestion, RunnerOption } from "@/components/runner";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_JWT_SECRET || "preview-secret-change-me"
);

interface Props {
  params: Promise<{ token: string }>;
}

export default async function SharedPreviewPage({ params }: Props) {
  const { token } = await params;

  // Verify JWT
  let payload: { quizId: string; versionId: string };
  try {
    const { payload: p } = await jwtVerify(token, SECRET);
    if (p.type !== "preview") throw new Error("Invalid token type");
    payload = p as unknown as { quizId: string; versionId: string };
  } catch {
    notFound();
  }

  const supabase = await createServerSupabaseClient();

  // Fetch quiz
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, slug")
    .eq("id", payload.quizId)
    .single();

  if (!quiz) notFound();

  // Fetch version
  const { data: version } = await supabase
    .from("quiz_versions")
    .select("id, version, status, time_limit_seconds, per_question_seconds, shuffle_questions, shuffle_options")
    .eq("id", payload.versionId)
    .single();

  if (!version) notFound();

  const v = version as unknown as {
    id: string;
    version: number;
    status: string;
    time_limit_seconds: number | null;
    per_question_seconds: number | null;
    shuffle_questions: boolean;
    shuffle_options: boolean;
  };

  // Fetch questions
  const { data: rawQuestions } = await supabase
    .from("questions")
    .select("id, kind, content_kind, stem, points, time_seconds, numeric_answer, numeric_tolerance, numeric_unit, explanation, media_key, media_alt, position, question_options(id, label, is_correct, position)")
    .eq("quiz_version_id", v.id)
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
    }>;
  }>).map((q) => ({
    ...q,
    options: (q.question_options || []) as RunnerOption[],
  }));

  return (
    <PreviewClient
      quiz={quiz as unknown as { id: string; title: string; slug: string }}
      version={v}
      questions={questions}
    />
  );
}
