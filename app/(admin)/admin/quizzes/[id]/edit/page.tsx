import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { QuizEditor } from "./quiz-editor";

interface Props {
  params: Promise<{ id: string }>;
}

interface QuizRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
}

interface VersionRow {
  id: string;
  version: number;
  status: string;
  time_limit_seconds: number | null;
  per_question_seconds: number | null;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  allow_backtrack: boolean;
  show_feedback: string;
  passing_score: number | null;
}

interface QuestionRow {
  id: string;
  kind: string;
  content_kind: string;
  stem: Record<string, unknown>;
  points: number;
  time_seconds: number | null;
  numeric_answer: number | null;
  numeric_tolerance: number;
  numeric_unit: string | null;
  explanation: Record<string, unknown> | null;
  media_key: string | null;
  media_alt: string | null;
  position: number;
  question_options: OptionRow[];
}

interface OptionRow {
  id: string;
  label: Record<string, unknown>;
  is_correct: boolean;
  position: number;
}

export default async function QuizEditPage({ params }: Props) {
  const { id } = await params;
  const authClient = await createServerSupabaseClient();

  // Verify user is authenticated
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) notFound();

  // Use admin client for data fetching (bypasses RLS)
  const supabase = createAdminClient();

  // Fetch quiz
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, slug, description, org_id")
    .eq("id", id)
    .single();

  if (!quiz) notFound();
  const quizRow = quiz as unknown as QuizRow & { org_id: string };

  // Get the latest draft version (or the latest version if none is draft)
  const { data: versions } = await supabase
    .from("quiz_versions")
    .select("id, version, status, time_limit_seconds, per_question_seconds, shuffle_questions, shuffle_options, allow_backtrack, show_feedback, passing_score")
    .eq("quiz_id", id)
    .order("version", { ascending: false });

  const allVersions = (versions ?? []) as unknown as VersionRow[];
  let draftVersion = allVersions.find((v) => v.status === "draft") ?? allVersions[0];

  // Auto-create initial version if none exists
  if (!draftVersion) {
    const { data: newVersion } = await supabase
      .from("quiz_versions")
      .insert({
        quiz_id: id,
        org_id: quizRow.org_id,
        version: 1,
        status: "draft",
      } as never)
      .select("id, version, status, time_limit_seconds, per_question_seconds, shuffle_questions, shuffle_options, allow_backtrack, show_feedback, passing_score")
      .single();

    if (!newVersion) notFound();
    draftVersion = newVersion as unknown as VersionRow;
  }

  // Fetch questions for this version
  const { data: questions } = await supabase
    .from("questions")
    .select("id, kind, content_kind, stem, points, time_seconds, numeric_answer, numeric_tolerance, numeric_unit, explanation, media_key, media_alt, position, question_options(id, label, is_correct, position)")
    .eq("quiz_version_id", draftVersion.id)
    .order("position", { ascending: true });

  const allQuestions = (questions ?? []) as unknown as QuestionRow[];

  return (
    <QuizEditor
      quiz={quizRow as unknown as QuizRow}
      version={draftVersion}
      questions={allQuestions}
    />
  );
}
