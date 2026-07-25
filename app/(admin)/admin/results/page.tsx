import { createServerSupabaseClient } from "@/lib/supabase/server";

interface SessionRow {
  id: string;
  raw_score: number | null;
  max_score: number | null;
  percentage: number | null;
  passed: boolean | null;
  duration_ms: number | null;
  submitted_at: string | null;
  participants: {
    personal_id: string;
    full_name: string;
    school: string | null;
  } | null;
}

export default async function ResultsPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("quiz_sessions")
    .select("*, participants(personal_id, full_name, school)")
    .eq("state", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(50);

  const sessions = (data ?? []) as unknown as SessionRow[];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Results
      </h1>

      <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--secondary)]">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Participant
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Score
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Percentage
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Duration
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Submitted
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {sessions.length > 0 ? (
              sessions.map((s) => {
                const participant = s.participants;
                return (
                  <tr key={s.id} className="hover:bg-[var(--secondary)]">
                    <td className="px-4 py-3">
                      <span className="font-medium">
                        {participant?.full_name || "Unknown"}
                      </span>
                      <br />
                      <span className="font-mono text-xs text-[var(--muted-foreground)]">
                        {participant?.personal_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {s.raw_score ?? "—"}/{s.max_score ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {s.percentage != null ? (
                        <span
                          className={
                            s.passed
                              ? "text-[var(--color-success-500)]"
                              : "text-[var(--color-danger-500)]"
                          }
                        >
                          {s.percentage}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {s.duration_ms
                        ? `${Math.round(s.duration_ms / 1000)}s`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {s.submitted_at
                        ? new Date(s.submitted_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                >
                  No submitted sessions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
