"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDownIcon, Globe, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { COUNTRIES_PARAM, parseCountries } from "./params";

interface SessionOption {
  id: string;
  title: string;
}

interface Props {
  sessions: SessionOption[];
  countries: string[];
}

export function TopScorersFilter({ sessions, countries }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const sessionId = searchParams.get("session") ?? "";
  const selected = parseCountries(searchParams.get(COUNTRIES_PARAM));

  function navigate(next: { session?: string; countries?: string[] }) {
    const params = new URLSearchParams();
    const session = next.session ?? sessionId;
    const list = next.countries ?? selected;
    if (session) params.set("session", session);
    if (list.length) params.set(COUNTRIES_PARAM, list.join(","));
    startTransition(() => router.push(`/admin/results/top-scorers?${params.toString()}`));
  }

  function toggleCountry(c: string, checked: boolean) {
    const set = new Set(selected);
    if (checked) set.add(c);
    else set.delete(c);
    navigate({ countries: countries.filter((x) => set.has(x)) });
  }

  const countryLabel =
    selected.length === 0
      ? "All countries"
      : selected.length <= 3
        ? selected.join(", ")
        : `${selected.length} countries`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={sessionId}
        onValueChange={(v) => navigate({ session: v ?? "" })}
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
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={!sessionId}
            render={<Button variant="outline" className="w-56 justify-between font-normal" />}
          >
            <span className="flex items-center gap-1.5 truncate">
              <Globe className="size-4 text-muted-foreground" />
              <span className="truncate">{countryLabel}</span>
            </span>
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            {countries.map((c) => (
              <DropdownMenuCheckboxItem
                key={c}
                checked={selected.includes(c)}
                onCheckedChange={(checked) => toggleCountry(c, checked)}
                closeOnClick={false}
              >
                {c}
              </DropdownMenuCheckboxItem>
            ))}
            {selected.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ countries: [] })}>
                  Clear selection
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
