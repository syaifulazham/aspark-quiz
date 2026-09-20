"use client";

import { useState } from "react";
import { ListOrdered, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface Scorer {
  sessionId: string;
  rank: number;
  fullName: string;
  personalId: string;
  school: string | null;
  grade: string | null;
  country: string | null;
  rawScore: number;
  maxScore: number;
  percentage: number;
  durationMs: number | null;
}

interface Props {
  quizLabel: string;
  scorers: Scorer[];
  index: number;
}

const MEDAL: Record<number, string> = {
  1: "bg-[oklch(0.85_0.14_85)] text-[oklch(0.35_0.08_70)] ring-[oklch(0.75_0.16_80)]",
  2: "bg-[oklch(0.88_0.01_250)] text-[oklch(0.4_0.02_255)] ring-[oklch(0.75_0.015_250)]",
  3: "bg-[oklch(0.78_0.09_55)] text-[oklch(0.32_0.07_45)] ring-[oklch(0.65_0.11_50)]",
};

function fmtDuration(ms: number | null) {
  if (ms == null) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function RankBadge({ rank, size = "md" }: { rank: number; size?: "md" | "sm" }) {
  const medal = MEDAL[rank];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-mono font-semibold ring-1",
        size === "md" ? "size-8 text-sm" : "size-6 text-xs",
        medal ?? "bg-[var(--secondary)] text-muted-foreground ring-[var(--border)]"
      )}
    >
      {rank}
    </span>
  );
}

function ScorerRow({ s, compact = false }: { s: Scorer; compact?: boolean }) {
  const meta = [s.school, s.grade, s.country].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3">
      <RankBadge rank={s.rank} size={compact ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", compact && "text-sm")}>{s.fullName}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {s.personalId}
          {meta && <span className="font-sans"> · {meta}</span>}
        </p>
      </div>
      <div className="text-right">
        <p className={cn("font-mono font-medium", compact ? "text-sm" : "")}>
          {s.rawScore}
          <span className="text-muted-foreground">/{s.maxScore}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {s.percentage}% · {fmtDuration(s.durationMs)}
        </p>
      </div>
    </div>
  );
}

export function QuizCard({ quizLabel, scorers, index }: Props) {
  const [open, setOpen] = useState(false);
  const top = scorers.slice(0, 3);

  return (
    <div
      className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-card p-4 shadow-[var(--shadow-card)] animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
      style={{ animationDelay: `${Math.min(index, 12) * 50}ms`, animationDuration: "350ms" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold tracking-tight">
            {quizLabel}
          </h3>
          <p className="text-xs text-muted-foreground">
            {scorers.length} {scorers.length === 1 ? "submission" : "submissions"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          disabled={scorers.length === 0}
          title="Show all"
          aria-label={`Show all ${scorers.length} scorers for ${quizLabel}`}
        >
          <ListOrdered />
        </Button>
      </div>

      <div className="mt-4 flex-1 space-y-3">
        {top.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-xs text-muted-foreground">
            <Trophy className="size-5 opacity-40" />
            No submissions yet
          </div>
        ) : (
          top.map((s) => <ScorerRow key={s.sessionId} s={s} />)
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{quizLabel}</DialogTitle>
            <DialogDescription>
              Full ranking · {scorers.length} {scorers.length === 1 ? "submission" : "submissions"}
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 max-h-[65vh] overflow-y-auto px-1">
            <div className="divide-y divide-[var(--border)]">
              {scorers.map((s) => (
                <div key={s.sessionId} className="py-2.5">
                  <ScorerRow s={s} compact />
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
