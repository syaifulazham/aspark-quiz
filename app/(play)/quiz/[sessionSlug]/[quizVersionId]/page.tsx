import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { TokenForm } from "./token-form";

interface SessionRow {
  id: string;
  title: string;
  is_active: boolean;
  opens_at: string | null;
  closes_at: string | null;
}

interface QuizSetRow {
  id: string;
  label: string | null;
  time_limit_seconds: number | null;
  quiz_version: {
    id: string;
    version: number;
    time_limit_seconds: number | null;
    quiz: { id: string; title: string };
  };
}

export default async function QuizEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionSlug: string; quizVersionId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { sessionSlug, quizVersionId } = await params;
  const { token: prefillToken } = await searchParams;
  const admin = createAdminClient();

  const { data: sessions } = await admin
    .from("competition_sessions")
    .select("id, title, is_active, opens_at, closes_at")
    .eq("slug", sessionSlug)
    .order("created_at", { ascending: false })
    .limit(1);

  const session = (sessions?.[0] ?? null) as unknown as SessionRow | null;
  if (!session) notFound();

  const { data: quizSetRaw } = await admin
    .from("session_quiz_sets")
    .select(
      "id, label, time_limit_seconds, quiz_version:quiz_versions!inner(id, version, time_limit_seconds, quiz:quizzes(id, title))"
    )
    .eq("competition_session_id", session.id)
    .eq("quiz_version_id", quizVersionId)
    .single();

  const quizSet = quizSetRaw as unknown as QuizSetRow | null;
  if (!quizSet) notFound();

  const now = new Date();
  const notOpenYet = session.opens_at !== null && new Date(session.opens_at) > now;
  const closed =
    !session.is_active ||
    (session.closes_at !== null && new Date(session.closes_at) < now);

  const timeLimitSeconds =
    quizSet.time_limit_seconds ?? quizSet.quiz_version.time_limit_seconds;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        {notOpenYet ? (
          <StatusCard
            title={quizSet.quiz_version.quiz.title}
            message={`This quiz opens at ${new Date(session.opens_at!).toLocaleString()}.`}
          />
        ) : closed ? (
          <StatusCard
            title={quizSet.quiz_version.quiz.title}
            message="This quiz session is closed."
          />
        ) : (
          <TokenForm
            competitionSessionId={session.id}
            quizVersionId={quizSet.quiz_version.id}
            sessionTitle={session.title}
            quizTitle={quizSet.label || quizSet.quiz_version.quiz.title}
            quizVersion={quizSet.quiz_version.version}
            timeLimitSeconds={timeLimitSeconds}
            initialToken={prefillToken ?? ""}
          />
        )}
      </div>
    </div>
  );
}

function StatusCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center shadow-lg">
      <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
