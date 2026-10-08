"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, FileText, KeyRound, Loader2, RotateCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { regenerateParticipantToken } from "@/lib/actions/live-token";
import { cn } from "@/lib/utils";
import type { AttemptState, LiveRow, LiveTokenStatus } from "./data";

interface Props {
  rows: LiveRow[];
  competitionSessionId: string;
  quizVersionId: string;
  country: string | null;
  canManage: boolean;
}

const TOKEN_PILL: Record<LiveTokenStatus, { label: string; className: string }> = {
  valid: { label: "Valid", className: "bg-[oklch(0.95_0.05_152)] text-[oklch(0.42_0.12_152)]" },
  not_yet_valid: { label: "Valid (not yet open)", className: "bg-[oklch(0.95_0.04_233)] text-[oklch(0.45_0.12_233)]" },
  used: { label: "Used", className: "bg-[oklch(0.95_0.04_233)] text-[oklch(0.45_0.12_233)]" },
  expired: { label: "Expired", className: "bg-[oklch(0.95_0.04_27)] text-[oklch(0.5_0.17_27)]" },
  revoked: { label: "Revoked", className: "bg-[var(--secondary)] text-muted-foreground" },
};

const ATTEMPT_LABEL: Record<AttemptState, string> = {
  not_started: "Not started",
  logged_in: "Logged in",
  in_progress: "In progress",
  submitted: "Submitted",
  voided: "Voided",
};

type Filter = "all" | "valid" | "used" | "expired" | "in_progress" | "submitted";

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString() : d.toLocaleString();
}

function Progress({ row }: { row: LiveRow }) {
  const pct = row.totalQuestions > 0 ? Math.round((row.answered / row.totalQuestions) * 100) : 0;
  const submitted = row.attemptState === "submitted";
  const overdue =
    row.attemptState === "in_progress" && row.deadlineAt && new Date(row.deadlineAt) < new Date();
  return (
    <div className="min-w-36">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className={cn("font-medium", submitted ? "text-[var(--color-success-500)]" : "text-muted-foreground")}>
          {ATTEMPT_LABEL[row.attemptState]}
          {overdue && <span className="ml-1 text-[var(--color-danger-500)]">· past deadline</span>}
        </span>
        <span className="font-mono text-muted-foreground">
          {row.answered}/{row.totalQuestions || "—"}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--secondary)]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% of questions answered`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            submitted
              ? "bg-[var(--color-success-500)]"
              : row.attemptState === "in_progress"
                ? "bg-[var(--primary)]"
                : "bg-[var(--color-ink-300)]"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {submitted && row.percentage != null && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">Score {row.percentage}%</p>
      )}
    </div>
  );
}

function confirmText(row: LiveRow) {
  if (row.attemptState === "submitted")
    return "This participant has already submitted. A new code lets them take the quiz again as a new attempt. Their submitted result is kept.";
  if (row.attemptState === "in_progress" || row.attemptState === "logged_in")
    return "This participant already used a code and has an unfinished attempt. A new code starts a fresh attempt; the unfinished one is left as it is.";
  if (row.tokenStatus === "valid" || row.tokenStatus === "not_yet_valid")
    return "Their current code still works. Generating a new one will revoke it, so only the new code works.";
  return "A new code will be issued, valid until the session closes.";
}

export function ParticipantsTable({ rows, competitionSessionId, quizVersionId, country, canManage }: Props) {
  const router = useRouter();

  function reportHref(extra: Record<string, string> = {}) {
    const p = new URLSearchParams({ session: competitionSessionId, quiz: quizVersionId });
    if (country) p.set("country", country);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/admin/live/report?${p}`;
  }
  const submittedCount = rows.filter((r) => r.attemptState === "submitted").length;
  const exportTitle = canManage ? undefined : "Only owners and admins can export answer scripts";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [target, setTarget] = useState<LiveRow | null>(null);
  const [result, setResult] = useState<{ token: string; startUrl: string; expiresAt: string; name: string } | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c = { all: rows.length, valid: 0, used: 0, expired: 0, in_progress: 0, submitted: 0 };
    for (const r of rows) {
      if (r.tokenStatus === "valid" || r.tokenStatus === "not_yet_valid") c.valid++;
      if (r.tokenStatus === "used") c.used++;
      if (r.tokenStatus === "expired") c.expired++;
      if (r.attemptState === "in_progress") c.in_progress++;
      if (r.attemptState === "submitted") c.submitted++;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (filter === "valid" && !(r.tokenStatus === "valid" || r.tokenStatus === "not_yet_valid")) return false;
      if (filter === "used" && r.tokenStatus !== "used") return false;
      if (filter === "expired" && r.tokenStatus !== "expired") return false;
      if (filter === "in_progress" && r.attemptState !== "in_progress") return false;
      if (filter === "submitted" && r.attemptState !== "submitted") return false;
      if (!words.length) return true;
      const hay = `${r.fullName} ${r.personalId} ${r.school ?? ""} ${r.grade ?? ""} ${r.country ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, query, filter]);

  function generate() {
    if (!target) return;
    const row = target;
    startTransition(async () => {
      const res = await regenerateParticipantToken({
        competitionSessionId,
        quizVersionId,
        participantId: row.participantId,
      });
      if (!res.success) {
        toast.error(res.error ?? "Could not generate a token");
        return;
      }
      setResult({ token: res.token, startUrl: res.startUrl, expiresAt: res.expiresAt, name: row.fullName });
      router.refresh();
    });
  }

  async function copy(text: string, which: "code" | "link") {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "All" },
    { key: "valid", label: "Valid" },
    { key: "used", label: "Used" },
    { key: "expired", label: "Expired" },
    { key: "in_progress", label: "In progress" },
    { key: "submitted", label: "Submitted" },
  ];

  const th = "px-4 py-2.5 text-left text-xs font-medium text-[var(--muted-foreground)] whitespace-nowrap";
  const td = "px-4 py-3 align-middle";

  return (
    <section
      className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-card shadow-[var(--shadow-card)] animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
      style={{ animationDelay: "80ms", animationDuration: "350ms" }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Participants</h2>
          <p className="text-xs text-muted-foreground">
            Sorted by name · showing {visible.length} of {rows.length}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative w-full max-w-xs sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, ID, school…"
              className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          {canManage && submittedCount > 0 ? (
            <Link
              href={reportHref()}
              target="_blank"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
              title="Answer scripts for everyone who submitted, ready to print or save as PDF"
            >
              <FileText />
              Answer scripts ({submittedCount})
            </Link>
          ) : (
            <Button variant="outline" size="sm" className="shrink-0" disabled title={exportTitle ?? "Nobody has submitted yet"}>
              <FileText />
              Answer scripts
            </Button>
          )}
        </div>
        <div className="flex w-full flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                filter === f.key
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border-[var(--border)] text-muted-foreground hover:bg-[var(--secondary)]"
              )}
            >
              {f.label} <span className="font-mono opacity-80">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--secondary)]">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Details</th>
              <th className={th}>Token</th>
              <th className={th}>Started</th>
              <th className={th}>Progress</th>
              <th className={th}>Ended</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {rows.length === 0
                    ? "No participants have been issued a code for this quiz in this session yet."
                    : "No participants match the current filter."}
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const pill = TOKEN_PILL[r.tokenStatus];
                return (
                  <tr key={r.participantId} className="hover:bg-[var(--secondary)]">
                    <td className={td}>
                      <p className="font-medium">{r.fullName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{r.personalId}</p>
                    </td>
                    <td className={`${td} text-xs text-muted-foreground`}>
                      {[r.grade, r.school, r.country].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className={td}>
                      <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", pill.className)}>
                        {pill.label}
                      </span>
                      <p
                        className="mt-0.5 font-mono text-[11px] text-muted-foreground"
                        title={r.tokenExpiresAt ? `Expires ${new Date(r.tokenExpiresAt).toLocaleString()}` : undefined}
                      >
                        {r.code}
                        {r.tokenCount > 1 && <span className="font-sans"> · {r.tokenCount} codes issued</span>}
                      </p>
                    </td>
                    <td className={`${td} whitespace-nowrap text-xs text-muted-foreground`}>{fmtTime(r.startedAt)}</td>
                    <td className={td}>
                      <Progress row={r} />
                    </td>
                    <td className={`${td} whitespace-nowrap text-xs text-muted-foreground`}>{fmtTime(r.endedAt)}</td>
                    <td className={`${td} text-right`}>
                      <div className="inline-flex items-center gap-1.5">
                        {canManage && r.attemptId ? (
                          <Link
                            href={reportHref({ participant: r.participantId })}
                            target="_blank"
                            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                            title="Answer script (print or save as PDF)"
                            aria-label={`Answer script for ${r.fullName}`}
                          >
                            <FileText />
                          </Link>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled
                            title={exportTitle ?? "No answers yet"}
                            aria-label="Answer script unavailable"
                          >
                            <FileText />
                          </Button>
                        )}
                        <Button
                          variant={r.tokenStatus === "expired" || r.tokenStatus === "revoked" ? "default" : "outline"}
                          size="sm"
                          disabled={!canManage}
                          title={canManage ? undefined : "Only owners and admins can generate tokens"}
                          onClick={() => {
                            setResult(null);
                            setTarget(r);
                          }}
                        >
                          {r.tokenStatus === "expired" || r.tokenStatus === "revoked" ? <KeyRound /> : <RotateCw />}
                          {r.tokenStatus === "expired" || r.tokenStatus === "revoked" ? "Generate" : "Regenerate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!target} onOpenChange={(open) => !open && !isPending && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {result ? (
            <>
              <DialogHeader>
                <DialogTitle>New code for {result.name}</DialogTitle>
                <DialogDescription>
                  Valid until {new Date(result.expiresAt).toLocaleString()}. Any previous unused code for this quiz no
                  longer works.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-[var(--secondary)] px-4 py-3">
                  <span className="font-mono text-3xl font-semibold tracking-[0.3em]">{result.token}</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => copy(result.token, "code")} aria-label="Copy code">
                    {copied === "code" ? <Check className="text-[var(--color-success-500)]" /> : <Copy />}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--border)] px-2 py-1.5 text-xs">
                    {result.startUrl}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copy(result.startUrl, "link")}>
                    {copied === "link" ? <Check /> : <Copy />}
                    Link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The link logs the participant straight into this quiz. Share it only with them.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => setTarget(null)}>Done</Button>
              </DialogFooter>
            </>
          ) : target ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {target.tokenStatus === "expired" || target.tokenStatus === "revoked" ? "Generate" : "Regenerate"} code
                </DialogTitle>
                <DialogDescription>
                  {target.fullName} <span className="font-mono">({target.personalId})</span>
                </DialogDescription>
              </DialogHeader>
              <p
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  target.attemptState === "submitted"
                    ? "bg-[oklch(0.96_0.06_85)] text-[oklch(0.42_0.11_70)]"
                    : "bg-[var(--secondary)]"
                )}
              >
                {confirmText(target)}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTarget(null)} disabled={isPending}>
                  Cancel
                </Button>
                <Button onClick={generate} disabled={isPending}>
                  {isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
                  {isPending ? "Generating…" : "Generate code"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
