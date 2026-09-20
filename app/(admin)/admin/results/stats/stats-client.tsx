"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SessionOption {
  id: string;
  title: string;
}

interface Props {
  sessions: SessionOption[];
  countries: string[];
}

const ALL = "__all__";

export function StatsFilter({ sessions, countries }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const sessionId = searchParams.get("session") ?? "";
  const country = searchParams.get("country") ?? "";

  function updateParams(next: { session?: string; country?: string }) {
    const params = new URLSearchParams();
    const entries = {
      session: next.session ?? sessionId,
      country: next.country ?? country,
    };
    for (const [key, value] of Object.entries(entries)) {
      if (value) params.set(key, value);
    }
    startTransition(() => router.push(`/admin/results/stats?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={sessionId}
        onValueChange={(v) => updateParams({ session: v ?? "" })}
      >
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

      {countries.length > 0 && (
        <Select
          value={country || ALL}
          onValueChange={(v) => updateParams({ country: !v || v === ALL ? "" : v })}
          disabled={!sessionId}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Countries">
              {(v: string | null) => (!v || v === ALL ? "All countries" : v)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All countries</SelectItem>
            {countries.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isPending && (
        <span className="flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in duration-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </span>
      )}
    </div>
  );
}
