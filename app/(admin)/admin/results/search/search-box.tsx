"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

const DEBOUNCE_MS = 350;

export function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQ);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the box in sync when navigating back/forward
  useEffect(() => setValue(urlQ), [urlQ]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function navigate(q: string) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    startTransition(() =>
      router.replace(`/admin/results/search${params.size ? `?${params}` : ""}`)
    );
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
  }

  function submitNow() {
    if (timer.current) clearTimeout(timer.current);
    navigate(value);
  }

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submitNow();
        }}
        className="relative max-w-2xl"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search by name, personal ID, email, external ref or school…"
          aria-label="Search participants and schools"
          className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-10 text-sm shadow-[var(--shadow-card)] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
          {isPending ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : value ? (
            <button
              type="button"
              onClick={() => {
                setValue("");
                navigate("");
                inputRef.current?.focus();
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </span>
      </form>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Every word must match somewhere. Use <code className="font-mono">*</code> as a wildcard, e.g.{" "}
        <code className="font-mono">Erdem*</code> (starts with) or{" "}
        <code className="font-mono">*school</code> (ends with).
      </p>
    </div>
  );
}
