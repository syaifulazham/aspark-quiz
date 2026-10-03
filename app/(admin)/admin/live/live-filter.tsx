"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface Props {
  sessions: Array<{ id: string; title: string }>;
  quizzes: Array<{ quizVersionId: string; label: string; participants: number }>;
}

const REFRESH_MS = 30_000;

export function LiveFilter({ sessions, quizzes }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [auto, setAuto] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [showAll, setShowAll] = useState(false);
  const sessionId = searchParams.get("session") ?? "";
  const quizVersionId = searchParams.get("quiz") ?? "";
  const ready = !!sessionId && !!quizVersionId;
  const emptyCount = quizzes.filter((q) => q.participants === 0).length;
  // Always keep the selected quiz in the list so the dropdown can show it, even if it's empty
  const visibleQuizzes = showAll
    ? quizzes
    : quizzes.filter((q) => q.participants > 0 || q.quizVersionId === quizVersionId);

  function navigate(next: { session?: string; quiz?: string }) {
    const params = new URLSearchParams();
    const s = next.session ?? sessionId;
    const q = next.quiz ?? quizVersionId;
    if (s) params.set("session", s);
    if (q) params.set("quiz", q);
    startTransition(() => router.push(`/admin/live?${params}`));
  }

  function refresh() {
    startTransition(() => {
      router.refresh();
      setLastRefreshed(new Date());
    });
  }

  useEffect(() => {
    if (!auto || !ready) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, ready, sessionId, quizVersionId]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={sessionId} onValueChange={(v) => navigate({ session: v ?? "", quiz: "" })}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select session">
            {(v: string | null) => sessions.find((s) => s.id === v)?.title ?? "Select session"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {sessions.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={quizVersionId}
        onValueChange={(v) => navigate({ quiz: v ?? "" })}
        disabled={!sessionId}
      >
        <SelectTrigger className="w-80">
          <SelectValue placeholder="Select quiz">
            {(v: string | null) => {
              const q = quizzes.find((x) => x.quizVersionId === v);
              return q ? `${q.label} · ${q.participants}` : "Select quiz";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="min-w-80">
          {visibleQuizzes.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No quiz has participants yet. Tick &ldquo;Show all&rdquo; to list every quiz.
            </p>
          )}
          {visibleQuizzes.map((q) => (
            <SelectItem key={q.quizVersionId} value={q.quizVersionId}>
              <span className={q.participants === 0 ? "text-muted-foreground" : undefined}>{q.label}</span>
              <span
                className={`ml-auto rounded-full px-1.5 font-mono text-[11px] ${
                  q.participants > 0
                    ? "bg-[var(--secondary)] text-foreground"
                    : "text-muted-foreground"
                }`}
                title={`${q.participants} ${q.participants === 1 ? "participant" : "participants"}`}
              >
                {q.participants}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {sessionId && quizzes.length > 0 && (
        <label
          className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground"
          title={`${emptyCount} ${emptyCount === 1 ? "quiz has" : "quizzes have"} no participants`}
        >
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="size-3.5 rounded border-border accent-[var(--primary)]"
          />
          Show all
          {emptyCount > 0 && <span className="font-mono">(+{emptyCount} empty)</span>}
        </label>
      )}

      {ready && (
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            <Switch checked={auto} onCheckedChange={setAuto} />
            Auto-refresh (30s)
          </label>
          <span className="hidden sm:inline">Updated {lastRefreshed.toLocaleTimeString()}</span>
          <Button variant="outline" size="sm" onClick={refresh} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        </div>
      )}
      {!ready && isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
