import { Suspense } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { TopScorersFilter } from "./top-scorers-client";
import { TopScorersGrid } from "./top-scorers-grid";
import { TopScorersSkeleton } from "./top-scorers-skeleton";
import { COUNTRIES_PARAM, parseCountries } from "./params";

interface Props {
  searchParams: Promise<{ session?: string; [COUNTRIES_PARAM]?: string }>;
}

interface CompetitionSessionRow {
  id: string;
  title: string;
}

export default async function TopScorersPage({ searchParams }: Props) {
  const params = await searchParams;
  const sessionId = params.session;

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

  const countryOptions = [
    ...new Set(
      ((participantRows ?? []) as unknown as Array<{ nationality: string | null }>)
        .map((r) => r.nationality)
        .filter((v): v is string => !!v && v.trim() !== "")
    ),
  ].sort();

  // Only keep known countries so a stale URL can't inject arbitrary filter values
  const countries = parseCountries(params[COUNTRIES_PARAM]).filter((c) =>
    countryOptions.includes(c)
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Top Scorers
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a competition session to view the top 3 for each quiz.
      </p>

      <div className="mt-4">
        <TopScorersFilter sessions={sessions} countries={countryOptions} />
      </div>

      {selectedSession && (
        <h2 className="mt-6 font-display text-xl font-semibold tracking-tight">
          {selectedSession.title}
          {countries.length > 0 && (
            <>
              <span className="mx-2 text-muted-foreground">›</span>
              {countries.join(", ")}
            </>
          )}
        </h2>
      )}

      {selectedSession ? (
        <Suspense
          key={`${selectedSession.id}|${countries.join(",")}`}
          fallback={<TopScorersSkeleton />}
        >
          <TopScorersGrid sessionId={selectedSession.id} countries={countries} />
        </Suspense>
      ) : (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] px-4 py-12 text-center text-[var(--muted-foreground)]">
          Select a session above to view top scorers.
        </div>
      )}
    </div>
  );
}
