function Bar({ className = "" }: { className?: string }) {
  return <div className={`h-3 rounded-full bg-[var(--color-ink-200)] ${className}`} />;
}

export function SearchSkeleton() {
  return (
    <div className="mt-6 space-y-6 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-card">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="h-5 w-48 rounded-md bg-[var(--color-ink-200)]" />
          <Bar className="mt-2 w-32" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <Bar className="w-16 h-2" />
              <Bar className="mt-2 w-28" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-card">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="h-5 w-40 rounded-md bg-[var(--color-ink-200)]" />
        </div>
        <div className="divide-y divide-[var(--border)]">
          {Array.from({ length: 6 }).map((_, r) => (
            <div key={r} className="flex items-center gap-6 px-4 py-4" style={{ opacity: 1 - r * 0.12 }}>
              <Bar className="w-40" />
              <Bar className="w-16" />
              <Bar className="w-32" />
              <Bar className="w-20" />
              <Bar className="w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
