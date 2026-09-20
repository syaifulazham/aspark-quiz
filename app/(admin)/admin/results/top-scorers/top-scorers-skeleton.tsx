function Bar({ className = "" }: { className?: string }) {
  return <div className={`h-3 rounded-full bg-[var(--color-ink-200)] ${className}`} />;
}

export function TopScorersSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div
      className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 animate-pulse"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-card p-4"
          style={{ opacity: 1 - Math.floor(i / 3) * 0.25 }}
        >
          <div className="flex items-center justify-between">
            <Bar className="w-40" />
            <div className="size-7 rounded-md bg-[var(--color-ink-200)]" />
          </div>
          <Bar className="mt-2 w-24" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, r) => (
              <div key={r} className="flex items-center gap-3">
                <div className="size-8 rounded-full bg-[var(--color-ink-200)]" />
                <div className="flex-1 space-y-1.5">
                  <Bar className="w-32" />
                  <Bar className="w-20 h-2" />
                </div>
                <Bar className="w-12" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
