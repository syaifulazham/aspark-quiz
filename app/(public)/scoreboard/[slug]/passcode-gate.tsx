"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { animate } from "animejs";
import { ArrowRight, Loader2, Lock } from "lucide-react";

export function PasscodeGate({ slug, title }: { slug: string; title: string }) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const card = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!card.current) return;
    const a = animate(card.current, { opacity: [0, 1], translateY: [24, 0], scale: [0.98, 1], duration: 900, ease: "outExpo" });
    return () => void a.revert();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/public/scoreboards/${encodeURIComponent(slug)}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (res.ok) {
      router.refresh();
      return;
    }
    setLoading(false);
    setError(res.status === 403 ? "That passcode isn't right. Try again." : "Something went wrong. Please try again.");
    if (card.current) animate(card.current, { translateX: [0, -10, 10, -6, 6, 0], duration: 450, ease: "inOutSine" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        ref={card}
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.05] p-8 opacity-0 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-300/30 to-violet-400/30 ring-1 ring-white/20">
          <Lock className="size-5 text-white/90" />
        </div>
        <p className="mt-5 text-center text-[11px] font-medium uppercase tracking-[0.3em] text-white/50">Private scoreboard</p>
        <h1 className="mt-2 text-center font-display text-2xl leading-tight tracking-tight">{title}</h1>
        <label className="mt-6 block text-xs text-white/60" htmlFor="sb-passcode">
          Enter the passcode to view the results
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="sb-passcode"
            type="password"
            autoFocus
            autoComplete="off"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 font-mono tracking-widest text-white outline-none placeholder:text-white/30 focus:border-teal-300/70 focus:ring-4 focus:ring-teal-300/15"
            placeholder="••••••"
          />
          <button
            type="submit"
            disabled={loading || !passcode.trim()}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-300 to-violet-300 px-4 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </form>
    </div>
  );
}
