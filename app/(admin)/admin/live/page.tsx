import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Radio } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LiveFilter } from "./live-filter";
import { LiveContent } from "./live-content";
import { LiveSkeleton } from "./live-skeleton";

interface Props {
  searchParams: Promise<{ session?: string; quiz?: string }>;
}

interface QuizSetRow {
  quiz_version_id: string;
  label: string | null;
  quiz_version: { version: number; quiz: { title: string } };
}

/** Distinct participants with at least one code, per quiz version, within a session. */
async function countParticipantsByQuiz(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  sessionId: string
) {
  const PAGE = 1000;
  const byQuiz = new Map<string, Set<string>>();
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("session_tokens")
      .select("participant_id, quiz_version_id")
      .eq("org_id", orgId)
      .eq("competition_session_id", sessionId)
      .range(from, from + PAGE - 1);
    const batch = (data ?? []) as unknown as Array<{ participant_id: string; quiz_version_id: string }>;
    for (const t of batch) {
      const set = byQuiz.get(t.quiz_version_id) ?? new Set<string>();
      set.add(t.participant_id);
      byQuiz.set(t.quiz_version_id, set);
    }
    if (batch.length < PAGE) break;
  }
  return byQuiz;
}

export default async function LivePage({ searchParams }: Props) {
  const { session: sessionId, quiz: quizVersionId } = await searchParams;

  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await authClient
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  const caller = profile as unknown as { org_id: string; role: string } | null;
  if (!caller) notFound();

  const supabase = createAdminClient();
  const { data: sessionRows } = await supabase
    .from("competition_sessions")
    .select("id, title, opens_at, closes_at, is_active")
    .eq("org_id", caller.org_id)
    .order("created_at", { ascending: false });

  const sessions = (sessionRows ?? []) as unknown as Array<{
    id: string;
    title: string;
    opens_at: string | null;
    closes_at: string | null;
    is_active: boolean;
  }>;
  const selectedSession = sessions.find((s) => s.id === sessionId) ?? null;

  let quizzes: Array<{ quizVersionId: string; label: string; participants: number }> = [];
  if (selectedSession) {
    const [{ data }, participantsByQuiz] = await Promise.all([
      supabase
        .from("session_quiz_sets")
        .select("quiz_version_id, label, quiz_version:quiz_versions!inner(version, quiz:quizzes(title))")
        .eq("competition_session_id", selectedSession.id)
        .order("position", { ascending: true }),
      countParticipantsByQuiz(supabase, caller.org_id, selectedSession.id),
    ]);
    quizzes = ((data ?? []) as unknown as QuizSetRow[]).map((qs) => ({
      quizVersionId: qs.quiz_version_id,
      label: qs.label || `${qs.quiz_version.quiz.title} (v${qs.quiz_version.version})`,
      participants: participantsByQuiz.get(qs.quiz_version_id)?.size ?? 0,
    }));
  }
  const selectedQuiz = quizzes.find((q) => q.quizVersionId === quizVersionId) ?? null;

  const now = new Date();
  const sessionState = selectedSession
    ? !selectedSession.is_active
      ? "Inactive"
      : selectedSession.opens_at && new Date(selectedSession.opens_at) > now
        ? `Opens ${new Date(selectedSession.opens_at).toLocaleString()}`
        : selectedSession.closes_at && new Date(selectedSession.closes_at) < now
          ? `Closed ${new Date(selectedSession.closes_at).toLocaleString()}`
          : selectedSession.closes_at
            ? `Open until ${new Date(selectedSession.closes_at).toLocaleString()}`
            : "Open"
    : null;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Live</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Monitor a quiz in progress and manage participants&apos; login codes.
      </p>

      <div className="mt-4">
        <LiveFilter
          sessions={sessions.map((s) => ({ id: s.id, title: s.title }))}
          quizzes={quizzes}
        />
      </div>

      {selectedSession && selectedQuiz && (
        <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {selectedSession.title}
            <span className="mx-2 text-muted-foreground">›</span>
            {selectedQuiz.label}
          </h2>
          {sessionState && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={`size-2 rounded-full ${
                  sessionState.startsWith("Open") ? "animate-pulse bg-[var(--color-success-500)]" : "bg-[var(--color-ink-300)]"
                }`}
              />
              {sessionState}
            </span>
          )}
        </div>
      )}

      {selectedSession && selectedQuiz ? (
        <Suspense key={`${selectedSession.id}|${selectedQuiz.quizVersionId}`} fallback={<LiveSkeleton />}>
          <LiveContent
            orgId={caller.org_id}
            sessionId={selectedSession.id}
            quizVersionId={selectedQuiz.quizVersionId}
            canManage={caller.role === "owner" || caller.role === "admin"}
          />
        </Suspense>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-16 text-center text-sm text-muted-foreground">
          <Radio className="size-6 opacity-40" />
          {selectedSession ? "Select a quiz to start monitoring." : "Select a session and quiz to start monitoring."}
        </div>
      )}
    </div>
  );
}
