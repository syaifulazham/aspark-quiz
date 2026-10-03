import { getLiveData } from "./data";
import { ParticipantsTable } from "./participants-table";

interface Props {
  orgId: string;
  sessionId: string;
  quizVersionId: string;
  canManage: boolean;
}

function StatCard({
  label,
  value,
  hint,
  tone,
  share,
  index,
}: {
  label: string;
  value: number;
  hint?: string;
  tone: string;
  share: number | null;
  index: number;
}) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-card p-4 shadow-[var(--shadow-card)] animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
      style={{ animationDelay: `${index * 60}ms`, animationDuration: "350ms" }}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tracking-tight">{value}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--secondary)]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.round((share ?? 1) * 100)}%`, background: tone }}
        />
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export async function LiveContent({ orgId, sessionId, quizVersionId, canManage }: Props) {
  const { stats, rows } = await getLiveData(orgId, sessionId, quizVersionId);
  const ofIssued = (n: number) => (stats.issued ? n / stats.issued : 0);

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          index={0}
          label="Registered participants"
          value={stats.registered}
          hint={`${stats.inProgress} in progress · ${stats.submitted} submitted`}
          tone="var(--color-ink-500)"
          share={stats.registered ? stats.submitted / stats.registered : 0}
        />
        <StatCard
          index={1}
          label="Issued tokens"
          value={stats.issued}
          hint={`${stats.valid} still valid and unused`}
          tone="var(--color-info-500)"
          share={stats.issued ? 1 : 0}
        />
        <StatCard
          index={2}
          label="Used tokens"
          value={stats.used}
          hint={stats.issued ? `${Math.round(ofIssued(stats.used) * 100)}% of issued` : undefined}
          tone="var(--color-success-500)"
          share={ofIssued(stats.used)}
        />
        <StatCard
          index={3}
          label="Expired tokens"
          value={stats.expired}
          hint={stats.issued ? `${Math.round(ofIssued(stats.expired) * 100)}% of issued, never used` : undefined}
          tone="var(--color-danger-500)"
          share={ofIssued(stats.expired)}
        />
      </div>

      <ParticipantsTable
        rows={rows}
        competitionSessionId={sessionId}
        quizVersionId={quizVersionId}
        canManage={canManage}
      />
    </>
  );
}
