import { LiveSkeleton } from "./live-skeleton";

export default function Loading() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Live</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Monitor a quiz in progress and manage participants&apos; login codes.
      </p>
      <div className="mt-4 flex gap-3 animate-pulse">
        <div className="h-8 w-64 rounded-lg bg-[var(--color-ink-200)]" />
        <div className="h-8 w-72 rounded-lg bg-[var(--color-ink-200)]" />
      </div>
      <LiveSkeleton />
    </div>
  );
}
