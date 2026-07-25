import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--foreground)]">
          Quizzly
        </h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          Quiz Hosting Platform
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/admin"
          className="rounded-[var(--radius-lg)] bg-[var(--primary)] px-6 py-3 text-sm font-medium text-[var(--primary-foreground)] shadow-[var(--shadow-card)] transition hover:opacity-90"
        >
          Admin Portal
        </Link>
        <Link
          href="/play"
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-6 py-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-card)] transition hover:bg-[var(--secondary)]"
        >
          Take a Quiz
        </Link>
      </div>
    </div>
  );
}
