import Link from "next/link";
import { cn } from "@/lib/utils";
import { registrationStatus, type Registration, type RegistrationStatus } from "./data";

export function fmtDuration(ms: number | null) {
  if (ms == null) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export function participantHref(id: string, q?: string) {
  const p = new URLSearchParams({ participant: id });
  if (q) p.set("q", q);
  return `/admin/results/search?${p}`;
}

export function schoolHref(name: string, q?: string) {
  const p = new URLSearchParams({ school: name });
  if (q) p.set("q", q);
  return `/admin/results/search?${p}`;
}

const STATUS: Record<RegistrationStatus, { label: string; className: string }> = {
  submitted: { label: "Submitted", className: "bg-[oklch(0.95_0.05_152)] text-[oklch(0.42_0.12_152)]" },
  in_progress: { label: "In progress", className: "bg-[oklch(0.96_0.06_85)] text-[oklch(0.45_0.11_70)]" },
  logged_in: { label: "Logged in, not started", className: "bg-[oklch(0.96_0.06_85)] text-[oklch(0.45_0.11_70)]" },
  not_started: { label: "Not started", className: "bg-[var(--secondary)] text-muted-foreground" },
  scheduled: { label: "Scheduled", className: "bg-[oklch(0.95_0.04_233)] text-[oklch(0.45_0.12_233)]" },
  expired: { label: "Expired, not taken", className: "bg-[oklch(0.95_0.04_27)] text-[oklch(0.5_0.17_27)]" },
  revoked: { label: "Revoked", className: "bg-[oklch(0.95_0.04_27)] text-[oklch(0.5_0.17_27)]" },
  voided: { label: "Voided", className: "bg-[oklch(0.95_0.04_27)] text-[oklch(0.5_0.17_27)]" },
};

export function StatusPill({ status }: { status: RegistrationStatus }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", s.className)}>
      {s.label}
    </span>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  delay = 0,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-card shadow-[var(--shadow-card)] animate-in fade-in slide-in-from-bottom-2 fill-mode-both",
        className
      )}
      style={{ animationDelay: `${delay}ms`, animationDuration: "350ms" }}
    >
      <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function StatCards({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
      {items.map((c) => (
        <div key={c.label} className="rounded-[var(--radius-md)] bg-[var(--secondary)] px-4 py-3">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="mt-0.5 font-display text-xl font-semibold tracking-tight">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

export function summarizeRegistrations(regs: Registration[]) {
  const submitted = regs.filter((r) => r.attempt?.state === "submitted");
  const pcts = submitted.map((r) => r.attempt!.percentage).filter((v): v is number => v != null);
  return {
    registered: regs.length,
    submitted: submitted.length,
    pending: regs.filter((r) => {
      const s = registrationStatus(r);
      return s === "not_started" || s === "scheduled" || s === "logged_in" || s === "in_progress";
    }).length,
    avgPct: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null,
    best: pcts.length ? Math.max(...pcts) : null,
  };
}

export function ScoreCell({ r }: { r: Registration }) {
  const a = r.attempt;
  if (!a || a.state !== "submitted") return <span className="text-muted-foreground">—</span>;
  return (
    <div>
      <span className="font-mono font-medium">
        {a.rawScore ?? "—"}
        <span className="text-muted-foreground">/{a.maxScore ?? "—"}</span>
      </span>
      <span className="ml-2 font-mono text-xs text-muted-foreground">{a.percentage ?? "—"}%</span>
      {a.correct != null && (
        <span className="block text-[11px] text-muted-foreground">
          {a.correct} correct · {a.incorrect ?? 0} wrong · {a.unanswered ?? 0} blank
        </span>
      )}
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

export const th = "px-4 py-2.5 text-left text-xs font-medium text-[var(--muted-foreground)]";
export const td = "px-4 py-3 align-top";

export function PlainLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("hover:text-[var(--primary)] hover:underline underline-offset-2", className)}>
      {children}
    </Link>
  );
}
