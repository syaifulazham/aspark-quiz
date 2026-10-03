"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Globe, Loader2, RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { countryLabel } from "./country";

interface Option {
  value: string;
  label: string;
  participants: number;
}

interface Props {
  countries: Array<{ value: string; participants: number }>;
  totalParticipants: number;
  sessions: Array<{ id: string; title: string; participants: number }>;
  quizzes: Array<{ quizVersionId: string; label: string; participants: number }>;
}

const REFRESH_MS = 30_000;
const ALL = "__all__";

function CountBadge({ n }: { n: number }) {
  return (
    <span
      className={`ml-auto rounded-full px-1.5 font-mono text-[11px] ${
        n > 0 ? "bg-[var(--secondary)] text-foreground" : "text-muted-foreground"
      }`}
      title={`${n} ${n === 1 ? "participant" : "participants"}`}
    >
      {n}
    </span>
  );
}

function CountSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
  emptyHint,
  icon,
  allOption,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
  className: string;
  disabled?: boolean;
  emptyHint: string;
  icon?: React.ReactNode;
  allOption?: { label: string; participants: number };
}) {
  return (
    <Select value={value || (allOption ? ALL : "")} onValueChange={(v) => onChange(!v || v === ALL ? "" : v)} disabled={disabled}>
      <SelectTrigger className={className}>
        {icon}
        <SelectValue placeholder={placeholder}>
          {(v: string | null) => {
            if (allOption && (!v || v === ALL)) return `${allOption.label} · ${allOption.participants}`;
            const o = options.find((x) => x.value === v);
            return o ? `${o.label} · ${o.participants}` : placeholder;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-(--anchor-width)">
        {allOption && (
          <SelectItem value={ALL}>
            <span>{allOption.label}</span>
            <CountBadge n={allOption.participants} />
          </SelectItem>
        )}
        {options.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyHint}</p>
        )}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className={o.participants === 0 ? "text-muted-foreground" : undefined}>{o.label}</span>
            <CountBadge n={o.participants} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LiveFilter({ countries, totalParticipants, sessions, quizzes }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [auto, setAuto] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [showAll, setShowAll] = useState(false);
  const country = searchParams.get("country") ?? "";
  const sessionId = searchParams.get("session") ?? "";
  const quizVersionId = searchParams.get("quiz") ?? "";
  const ready = !!sessionId && !!quizVersionId;

  // Hide empty choices unless "Show all"; never hide the current selection
  const visible = <T extends { participants: number }>(list: T[], isSelected: (x: T) => boolean) =>
    showAll ? list : list.filter((x) => x.participants > 0 || isSelected(x));
  const sessionOptions = visible(sessions, (s) => s.id === sessionId).map((s) => ({
    value: s.id,
    label: s.title,
    participants: s.participants,
  }));
  const quizOptions = visible(quizzes, (q) => q.quizVersionId === quizVersionId).map((q) => ({
    value: q.quizVersionId,
    label: q.label,
    participants: q.participants,
  }));
  const hidden =
    sessions.filter((s) => s.participants === 0 && s.id !== sessionId).length +
    quizzes.filter((q) => q.participants === 0 && q.quizVersionId !== quizVersionId).length;

  function navigate(next: { country?: string; session?: string; quiz?: string }) {
    const params = new URLSearchParams();
    const c = next.country ?? country;
    const s = next.session ?? sessionId;
    const q = next.quiz ?? quizVersionId;
    if (c) params.set("country", c);
    if (s) params.set("session", s);
    if (q) params.set("quiz", q);
    startTransition(() => router.push(`/admin/live${params.size ? `?${params}` : ""}`));
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
  }, [auto, ready, sessionId, quizVersionId, country]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <CountSelect
        value={country}
        // A new country restarts the cascade
        onChange={(v) => navigate({ country: v, session: "", quiz: "" })}
        options={countries.map((c) => ({ value: c.value, label: countryLabel(c.value), participants: c.participants }))}
        allOption={{ label: "All countries", participants: totalParticipants }}
        placeholder="Select country"
        className="w-56"
        emptyHint="No participants yet."
        icon={<Globe className="size-4 text-muted-foreground" />}
      />

      <CountSelect
        value={sessionId}
        onChange={(v) => navigate({ session: v, quiz: "" })}
        options={sessionOptions}
        placeholder="Select session"
        className="w-64"
        emptyHint={`No session has participants${country ? ` from ${countryLabel(country)}` : ""}. Tick “Show all”.`}
      />

      <CountSelect
        value={quizVersionId}
        onChange={(v) => navigate({ quiz: v })}
        options={quizOptions}
        placeholder="Select quiz"
        className="w-80"
        disabled={!sessionId}
        emptyHint={`No quiz has participants${country ? ` from ${countryLabel(country)}` : ""}. Tick “Show all”.`}
      />

      <label
        className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground"
        title="Include sessions and quizzes with no participants"
      >
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
          className="size-3.5 rounded border-border accent-[var(--primary)]"
        />
        Show all
        {!showAll && hidden > 0 && <span className="font-mono">(+{hidden} empty)</span>}
      </label>

      {ready ? (
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
      ) : (
        isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
