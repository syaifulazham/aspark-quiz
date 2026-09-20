import { StatsSkeleton } from "./stats-skeleton";

export default function Loading() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Stats
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a competition session to view quiz statistics.
      </p>
      <div className="mt-4 flex gap-3 animate-pulse">
        <div className="h-9 w-64 rounded-md bg-[var(--color-ink-200)]" />
        <div className="h-9 w-48 rounded-md bg-[var(--color-ink-200)]" />
      </div>
      <StatsSkeleton />
    </div>
  );
}
