"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { ArrowUp, Maximize2, Minimize2, Sparkles, Timer, Trophy, Users } from "lucide-react";
import type { PublicScoreboard } from "@/lib/scoreboard/data";
import { countryName } from "@/lib/country";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30_000;

const flag = (code: string | null) =>
  code && /^[A-Za-z]{2}$/.test(code)
    ? String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)))
    : "";

function fmtTime(ms: number | null) {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

const MEDAL = [
  "from-amber-200 via-yellow-300 to-amber-500 text-amber-950 shadow-[0_0_24px_-4px_rgba(251,191,36,0.75)]",
  "from-slate-100 via-slate-300 to-slate-400 text-slate-900 shadow-[0_0_20px_-6px_rgba(226,232,240,0.6)]",
  "from-orange-200 via-orange-400 to-amber-700 text-orange-950 shadow-[0_0_20px_-6px_rgba(251,146,60,0.6)]",
];

type Change = "up" | "new";

export function ScoreboardView({ slug, initial }: { slug: string; initial: PublicScoreboard }) {
  const [data, setData] = useState(initial);
  const [changes, setChanges] = useState<Map<string, Change>>(new Map());
  const [fullscreen, setFullscreen] = useState(false);
  const [stale, setStale] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const prevRanks = useRef(rankIndex(initial));
  const mounted = useRef(false);

  // ── Entrance ────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.querySelectorAll<HTMLElement>("[data-reveal]").forEach((n) => (n.style.opacity = "1"));
      return;
    }
    const a1 = animate(el.querySelectorAll("[data-hero]"), {
      opacity: [0, 1],
      translateY: [18, 0],
      filter: ["blur(8px)", "blur(0px)"],
      delay: stagger(90),
      duration: 1000,
      ease: "outExpo",
    });
    const a2 = animate(el.querySelectorAll("[data-card]"), {
      opacity: [0, 1],
      translateY: [32, 0],
      scale: [0.97, 1],
      delay: stagger(70, { start: 250 }),
      duration: 900,
      ease: "outExpo",
    });
    const a3 = animate(el.querySelectorAll("[data-row]"), {
      opacity: [0, 1],
      translateX: [-14, 0],
      delay: stagger(28, { start: 500 }),
      duration: 650,
      ease: "outQuart",
    });
    mounted.current = true;
    return () => {
      a1.revert();
      a2.revert();
      a3.revert();
    };
  }, []);

  // ── Live refresh ────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/scoreboards/${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        window.location.reload(); // passcode changed, board closed or removed
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as PublicScoreboard;
      const nextRanks = rankIndex(next);
      const diff = new Map<string, Change>();
      for (const [key, rank] of nextRanks) {
        const before = prevRanks.current.get(key);
        if (before == null) diff.set(key, "new");
        else if (rank < before) diff.set(key, "up");
      }
      prevRanks.current = nextRanks;
      setChanges(diff);
      setData(next);
      setStale(false);
    } catch {
      setStale(true);
    }
  }, [slug]);

  useEffect(() => {
    if (!data.autoRefresh) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [data.autoRefresh, refresh]);

  // Highlight rows that are new or climbed since the last refresh
  useEffect(() => {
    const el = root.current;
    if (!el || changes.size === 0) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-row]")).filter((r) => changes.has(r.dataset.key ?? ""));
    if (!rows.length) return;
    const a = animate(rows, {
      backgroundColor: ["rgba(45,212,191,0.28)", "rgba(45,212,191,0)"],
      translateX: [-10, 0],
      duration: 2400,
      ease: "outQuad",
      delay: stagger(60),
    });
    const t = setTimeout(() => setChanges(new Map()), 6000);
    return () => {
      a.revert();
      clearTimeout(t);
    };
  }, [changes]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () =>
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});

  const updated = useMemo(
    () => new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    [data.generatedAt]
  );

  return (
    <div ref={root} className="mx-auto max-w-[1600px] px-5 pb-16 pt-8 sm:px-8 lg:px-12">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div data-hero data-reveal className="flex items-center gap-3 opacity-0">
            <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-300 to-violet-400 text-slate-950">
              <Trophy className="size-4" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
              Quizzly · {data.session.title}
            </span>
          </div>
          <h1
            data-hero
            data-reveal
            className="mt-4 bg-gradient-to-r from-white via-teal-100 to-violet-200 bg-clip-text font-display text-4xl leading-[1.05] tracking-tight text-transparent opacity-0 sm:text-5xl lg:text-6xl"
          >
            {data.title}
          </h1>
          {data.description && (
            <p data-hero data-reveal className="mt-3 max-w-3xl text-base text-white/65 opacity-0 sm:text-lg">
              {data.description}
            </p>
          )}
          <div data-hero data-reveal className="mt-5 flex flex-wrap items-center gap-2 opacity-0">
            {data.countries.length > 0 &&
              data.countries.map((c) => (
                <Chip key={c}>
                  <span className="text-sm leading-none">{flag(c)}</span> {countryName(c)}
                </Chip>
              ))}
            <Chip>
              <Sparkles className="size-3.5 text-teal-200" /> Top {data.topN} per quiz
            </Chip>
            <Chip>
              <Users className="size-3.5 text-violet-200" /> {data.totals.participants} participants
            </Chip>
            <Chip>
              <Trophy className="size-3.5 text-amber-200" /> {data.totals.quizzes} quizzes
            </Chip>
          </div>
        </div>

        <div data-hero data-reveal className="flex items-center gap-3 opacity-0">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-right backdrop-blur-md">
            <p className="flex items-center justify-end gap-2 text-[11px] font-semibold uppercase tracking-[0.25em]">
              {data.autoRefresh ? (
                <>
                  <span className="relative flex size-2">
                    <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-75", stale ? "bg-amber-400" : "bg-emerald-400")} />
                    <span className={cn("relative inline-flex size-2 rounded-full", stale ? "bg-amber-400" : "bg-emerald-400")} />
                  </span>
                  <span className={stale ? "text-amber-200" : "text-emerald-200"}>{stale ? "Reconnecting" : "Live"}</span>
                </>
              ) : (
                <span className="text-white/60">Results</span>
              )}
            </p>
            <p className="mt-0.5 font-mono text-xs text-white/50">Updated {updated}</p>
          </div>
          <button
            onClick={toggleFullscreen}
            className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 backdrop-blur-md transition hover:bg-white/10 hover:text-white"
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            title={fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </header>

      {/* ── Quizzes ────────────────────────────────────────────────────── */}
      {data.quizzes.length === 0 ? (
        <div data-card data-reveal className="mt-16 rounded-3xl border border-white/10 bg-white/[0.04] p-12 text-center text-white/60 opacity-0 backdrop-blur-md">
          No quizzes on this scoreboard yet.
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {data.quizzes.map((q) => (
            <section
              key={q.key}
              data-card
              data-reveal
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] opacity-0 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-200/50 to-transparent" />
              <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
                <h2 className="font-display text-xl leading-snug tracking-tight text-white">{q.label}</h2>
                <span className="shrink-0 rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-medium text-white/60 ring-1 ring-white/10">
                  {q.participants} {q.participants === 1 ? "entry" : "entries"}
                </span>
              </header>

              {q.entries.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 pb-8 pt-4 text-center text-sm text-white/45">
                  <Timer className="size-5 opacity-60" />
                  Awaiting the first submission
                </div>
              ) : (
                <ol className="px-3 pb-4">
                  {q.entries.map((e) => {
                    const top = e.rank <= 3;
                    const change = changes.get(`${q.key}:${e.key}`);
                    return (
                      <li
                        key={e.key}
                        data-row
                        data-reveal
                        data-key={`${q.key}:${e.key}`}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl px-2.5 py-2 opacity-0",
                          e.rank === 1 && "bg-gradient-to-r from-amber-300/[0.12] to-transparent"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold",
                            top ? `bg-gradient-to-br ${MEDAL[e.rank - 1]}` : "bg-white/[0.06] text-white/60 ring-1 ring-white/10"
                          )}
                        >
                          {e.rank}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate font-medium", top ? "text-white" : "text-white/85")}>
                            {e.name}
                            {change && (
                              <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-teal-300/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-teal-200">
                                {change === "up" ? <ArrowUp className="size-3" /> : <Sparkles className="size-3" />}
                                {change === "up" ? "Up" : "New"}
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-white/45">
                            {e.country && <span className="mr-1">{flag(e.country)}</span>}
                            {[e.school, e.grade].filter(Boolean).join(" · ") || (e.country ? countryName(e.country) : "")}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cn("font-mono text-lg font-semibold tabular-nums", e.rank === 1 ? "text-amber-200" : "text-white")}>
                            {e.percentage.toFixed(e.percentage % 1 ? 1 : 0)}
                            <span className="text-xs text-white/50">%</span>
                          </p>
                          <p className="font-mono text-[11px] tabular-nums text-white/40">
                            {e.raw}/{e.max} · {fmtTime(e.durationMs)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}

      <footer className="mt-12 text-center text-[11px] uppercase tracking-[0.3em] text-white/35">
        Ranked by score, then time taken · Powered by Quizzly
      </footer>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-white/75 backdrop-blur-md">
      {children}
    </span>
  );
}

function rankIndex(d: PublicScoreboard) {
  const m = new Map<string, number>();
  for (const q of d.quizzes) for (const e of q.entries) m.set(`${q.key}:${e.key}`, e.rank);
  return m;
}
