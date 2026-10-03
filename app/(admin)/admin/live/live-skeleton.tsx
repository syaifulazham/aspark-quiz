function Bar({ className = "" }: { className?: string }) {
  return <div className={`h-3 rounded-full bg-[var(--color-ink-200)] ${className}`} />;
}

export function LiveSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-card p-4">
            <Bar className="w-24" />
            <div className="mt-3 h-7 w-14 rounded-md bg-[var(--color-ink-200)]" />
            <Bar className="mt-3 h-2 w-full" />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-card">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="h-5 w-32 rounded-md bg-[var(--color-ink-200)]" />
          <Bar className="mt-2 w-40 h-2" />
        </div>
        <div className="divide-y divide-[var(--border)]">
          {Array.from({ length: 8 }).map((_, r) => (
            <div key={r} className="flex items-center gap-6 px-4 py-4" style={{ opacity: 1 - r * 0.1 }}>
              <div className="w-44 space-y-1.5">
                <Bar className="w-36" />
                <Bar className="w-20 h-2" />
              </div>
              <Bar className="w-32" />
              <Bar className="w-14" />
              <Bar className="w-16" />
              <div className="w-36 space-y-1.5">
                <Bar className="w-20 h-2" />
                <Bar className="w-full h-1.5" />
              </div>
              <Bar className="w-16" />
              <div className="ml-auto h-7 w-24 rounded-md bg-[var(--color-ink-200)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
