import { Suspense } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { StatsFilter } from "./stats-client";
import { StatsTable } from "./stats-table";
import { StatsSkeleton } from "./stats-skeleton";

interface Props {
  searchParams: Promise<{ session?: string; country?: string }>;
}

interface CompetitionSessionRow {
  id: string;
  title: string;
}

export default async function StatsPage({ searchParams }: Props) {
  const { session: sessionId, country } = await searchParams;

  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) notFound();

  const supabase = createAdminClient();

  const { data: profile } = await authClient
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  const orgId = (profile as unknown as { org_id: string } | null)?.org_id;

  const [{ data: sessionRows }, { data: participantRows }] = await Promise.all([
    supabase
      .from("competition_sessions")
      .select("id, title")
      .order("created_at", { ascending: false }),
    orgId
      ? supabase.from("participants").select("nationality").eq("org_id", orgId)
      : Promise.resolve({ data: [] }),
  ]);

  const sessions = (sessionRows ?? []) as unknown as CompetitionSessionRow[];
  const selectedSession = sessions.find((s) => s.id === sessionId) ?? null;

  const countries = [
    ...new Set(
      ((participantRows ?? []) as unknown as Array<{ nationality: string | null }>)
        .map((r) => r.nationality)
        .filter((v): v is string => !!v && v.trim() !== "")
    ),
  ].sort();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Stats
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a competition session to view quiz statistics.
      </p>

      <div className="mt-4">
        <StatsFilter sessions={sessions} countries={countries} />
      </div>

      {selectedSession && (
        <h2 className="mt-6 font-display text-xl font-semibold tracking-tight">
          {selectedSession.title}
          {country && (
            <>
              <span className="mx-2 text-muted-foreground">›</span>
              {country}
            </>
          )}
        </h2>
      )}

      {selectedSession ? (
        <Suspense key={`${selectedSession.id}|${country ?? ""}`} fallback={<StatsSkeleton />}>
          <StatsTable sessionId={selectedSession.id} country={country} />
        </Suspense>
      ) : (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] px-4 py-12 text-center text-[var(--muted-foreground)]">
          Select a session above to view stats.
        </div>
      )}
    </div>
  );
}
