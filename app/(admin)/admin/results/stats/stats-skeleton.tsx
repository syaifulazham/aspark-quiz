const COLS = 8;
const ROWS = 8;

function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-3 rounded-full bg-[var(--color-ink-200)] ${className}`}
    />
  );
}

export function StatsSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-card p-4"
          >
            <Bar className="w-20" />
            <div className="mt-3 h-6 w-16 rounded-md bg-[var(--color-ink-200)]" />
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--secondary)]">
            <tr>
              {Array.from({ length: COLS }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <Bar className={i === 0 ? "w-24" : "w-14"} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {Array.from({ length: ROWS }).map((_, r) => (
              <tr key={r} style={{ opacity: 1 - r * 0.09 }}>
                {Array.from({ length: COLS }).map((_, c) => (
                  <td key={c} className="px-4 py-4">
                    <Bar className={c === 0 ? "w-40" : c === 1 ? "w-8" : "w-10"} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
