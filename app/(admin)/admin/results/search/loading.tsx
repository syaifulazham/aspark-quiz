import { SearchSkeleton } from "./search-skeleton";

export default function Loading() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Search</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Find a participant or school and see their quizzes and results.
      </p>
      <div className="mt-4 h-10 max-w-2xl animate-pulse rounded-lg bg-[var(--color-ink-200)]" />
      <SearchSkeleton />
    </div>
  );
}
