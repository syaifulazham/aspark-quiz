import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Radio } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LiveFilter } from "./live-filter";
import { LiveContent } from "./live-content";
import { LiveSkeleton } from "./live-skeleton";
import { NO_COUNTRY, countryLabel, normalizeCountry } from "./country";

interface Props {
  searchParams: Promise<{ session?: string; quiz?: string; country?: string }>;
}

interface QuizSetRow {
  quiz_version_id: string;
  label: string | null;
  quiz_version: { version: number; quiz: { title: string } };
}

interface CodeIndexRow {
  participant_id: string;
  quiz_version_id: string;
  competition_session_id: string;
  participant: { nationality: string | null } | null;
}

/** Every session-bound code in the org (who, which quiz, which session, which country). */
async function loadCodeIndex(supabase: ReturnType<typeof createAdminClient>, orgId: string) {
  const PAGE = 1000;
  const rows: Array<{ participantId: string; quizVersionId: string; sessionId: string; country: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("session_tokens")
      .select("participant_id, quiz_version_id, competition_session_id, participant:participants!inner(nationality)")
      .eq("org_id", orgId)
      .not("competition_session_id", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as CodeIndexRow[];
    for (const t of batch) {
      rows.push({
        participantId: t.participant_id,
        quizVersionId: t.quiz_version_id,
        sessionId: t.competition_session_id,
        country: normalizeCountry(t.participant?.nationality),
      });
    }
    if (batch.length < PAGE) break;
  }
  return rows;
}

function countDistinct<T>(rows: T[], key: (r: T) => string, participant: (r: T) => string) {
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = key(r);
    const set = map.get(k) ?? new Set<string>();
    set.add(participant(r));
    map.set(k, set);
  }
  return new Map([...map].map(([k, v]) => [k, v.size]));
}

export default async function LivePage({ searchParams }: Props) {
  const { session: sessionId, quiz: quizVersionId, country: rawCountry } = await searchParams;
  const countryParam = rawCountry?.trim() || null;

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
  const [{ data: sessionRows }, codes] = await Promise.all([
    supabase
      .from("competition_sessions")
      .select("id, title, opens_at, closes_at, is_active")
      .eq("org_id", caller.org_id)
      .order("created_at", { ascending: false }),
    loadCodeIndex(supabase, caller.org_id),
  ]);

  // Country → session → quiz: each level is counted within the levels chosen before it
  const countryCounts = countDistinct(codes, (c) => c.country, (c) => c.participantId);
  const countries = [...countryCounts.entries()]
    .map(([value, participants]) => ({ value, participants }))
    .sort((a, b) =>
      a.value === NO_COUNTRY ? 1 : b.value === NO_COUNTRY ? -1 : b.participants - a.participants || a.value.localeCompare(b.value)
    );
  const country = countryParam && countryCounts.has(countryParam) ? countryParam : null;
  const inCountry = country ? codes.filter((c) => c.country === country) : codes;
  const totalInCountry = new Set(inCountry.map((c) => c.participantId)).size;
  const sessionCounts = countDistinct(inCountry, (c) => c.sessionId, (c) => c.participantId);

  const sessions = ((sessionRows ?? []) as unknown as Array<{
    id: string;
    title: string;
    opens_at: string | null;
    closes_at: string | null;
    is_active: boolean;
  }>).map((s) => ({ ...s, participants: sessionCounts.get(s.id) ?? 0 }));
  const selectedSession = sessions.find((s) => s.id === sessionId) ?? null;

  let quizzes: Array<{ quizVersionId: string; label: string; participants: number }> = [];
  if (selectedSession) {
    const { data } = await supabase
      .from("session_quiz_sets")
      .select("quiz_version_id, label, quiz_version:quiz_versions!inner(version, quiz:quizzes(title))")
      .eq("competition_session_id", selectedSession.id)
      .order("position", { ascending: true });
    const quizCounts = countDistinct(
      inCountry.filter((c) => c.sessionId === selectedSession.id),
      (c) => c.quizVersionId,
      (c) => c.participantId
    );
    quizzes = ((data ?? []) as unknown as QuizSetRow[]).map((qs) => ({
      quizVersionId: qs.quiz_version_id,
      label: qs.label || `${qs.quiz_version.quiz.title} (v${qs.quiz_version.version})`,
      participants: quizCounts.get(qs.quiz_version_id) ?? 0,
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
          countries={countries}
          totalParticipants={new Set(codes.map((c) => c.participantId)).size}
          sessions={sessions.map((s) => ({ id: s.id, title: s.title, participants: s.participants }))}
          quizzes={quizzes}
        />
      </div>

      {selectedSession && selectedQuiz && (
        <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {country && (
              <>
                {countryLabel(country)}
                <span className="mx-2 text-muted-foreground">›</span>
              </>
            )}
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
        <Suspense key={`${selectedSession.id}|${selectedQuiz.quizVersionId}|${country ?? ""}`} fallback={<LiveSkeleton />}>
          <LiveContent
            orgId={caller.org_id}
            sessionId={selectedSession.id}
            quizVersionId={selectedQuiz.quizVersionId}
            country={country}
            canManage={caller.role === "owner" || caller.role === "admin"}
          />
        </Suspense>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-16 text-center text-sm text-muted-foreground">
          <Radio className="size-6 opacity-40" />
          {selectedSession
            ? "Select a quiz to start monitoring."
            : `Select ${country ? "" : "a country (optional), "}a session and a quiz to start monitoring.`}
          {country && !selectedSession && (
            <span className="text-xs">
              {totalInCountry} {totalInCountry === 1 ? "participant" : "participants"} from {countryLabel(country)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
