import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SearchBox } from "./search-box";
import { SearchResults } from "./search-results";
import { ParticipantView } from "./participant-view";
import { SchoolView } from "./school-view";
import { SearchSkeleton } from "./search-skeleton";

interface Props {
  searchParams: Promise<{ q?: string; participant?: string; school?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "", participant, school } = await searchParams;

  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await authClient
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  const orgId = (profile as unknown as { org_id: string } | null)?.org_id;
  if (!orgId) notFound();

  const query = q.trim();
  const detail = participant || school;
  const backHref = query ? `/admin/results/search?q=${encodeURIComponent(query)}` : "/admin/results/search";

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Search</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Find a participant or school and see their quizzes and results.
      </p>

      <div className="mt-4">
        <SearchBox />
      </div>

      {detail && (
        <Link
          href={backHref}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {query ? `Back to results for “${query}”` : "Back to search"}
        </Link>
      )}

      <Suspense
        key={`${participant ?? ""}|${school ?? ""}|${detail ? "" : query}`}
        fallback={<SearchSkeleton />}
      >
        {participant ? (
          <ParticipantView orgId={orgId} id={participant} q={query || undefined} />
        ) : school ? (
          <SchoolView orgId={orgId} school={school} q={query || undefined} />
        ) : query ? (
          <SearchResults orgId={orgId} q={query} />
        ) : (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-16 text-center text-sm text-muted-foreground">
            <Search className="size-6 opacity-40" />
            Start typing to search participants and schools.
          </div>
        )}
      </Suspense>
    </div>
  );
}
