import { TopScorersSkeleton } from "./top-scorers-skeleton";

export default function Loading() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Top Scorers
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a competition session to view the top 3 for each quiz.
      </p>
      <div className="mt-4 flex gap-3 animate-pulse">
        <div className="h-8 w-64 rounded-lg bg-[var(--color-ink-200)]" />
        <div className="h-8 w-56 rounded-lg bg-[var(--color-ink-200)]" />
      </div>
      <TopScorersSkeleton />
    </div>
  );
}
