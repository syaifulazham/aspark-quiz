import { Aurora } from "./aurora";

/** Full-screen dark stage with the animated aurora behind the content. */
export function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-x-hidden text-white antialiased [color-scheme:dark]">
      <Aurora />
      {children}
    </div>
  );
}

export function CenterCard({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-white/50">Quizzly</p>
        <h1 className="mt-3 font-display text-3xl tracking-tight">{title}</h1>
        {children}
      </div>
    </div>
  );
}
