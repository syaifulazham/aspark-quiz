import Link from "next/link";
import {
  Trophy,
  Users,
  Globe,
  Zap,
  Shield,
  BarChart3,
  ArrowRight,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ─── Navigation ─── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-display text-lg tracking-tight">Quizzly</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm md:flex">
            <a href="#features" className="text-muted-foreground transition hover:text-foreground">
              Features
            </a>
            <a href="#how-it-works" className="text-muted-foreground transition hover:text-foreground">
              How it works
            </a>
            <a href="#use-cases" className="text-muted-foreground transition hover:text-foreground">
              Use cases
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/login"
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/admin"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-24 md:pb-32 md:pt-36">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Quiz Hosting Platform
            </p>
            <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight md:text-6xl md:leading-[1.1]">
              Run competitions,{" "}
              <span className="text-primary">assessments</span> & live
              tournaments — at scale.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              From classroom quizzes to international olympiads. Create, manage,
              and deliver timed examinations with real-time scoring, participant
              management, and detailed analytics.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition hover:opacity-90"
              >
                Open Admin Portal
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/play"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold transition hover:bg-secondary"
              >
                Take a Quiz
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="border-t border-border/50 bg-card py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Features
          </p>
          <h2 className="mt-3 font-display text-3xl tracking-tight md:text-4xl">
            Everything you need to host world-class quizzes.
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border p-6 transition hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section id="how-it-works" className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            How it works
          </p>
          <h2 className="mt-3 font-display text-3xl tracking-tight md:text-4xl">
            Four steps. Zero friction.
          </h2>
          <div className="mt-12 grid gap-0 sm:grid-cols-4">
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative flex flex-col items-start">
                {i < STEPS.length - 1 && (
                  <div className="absolute left-5 top-5 hidden h-0.5 w-[calc(100%-2.5rem)] bg-primary/20 sm:block" />
                )}
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="mt-4 text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Use cases ─── */}
      <section id="use-cases" className="border-t border-border/50 bg-card py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Use cases
          </p>
          <h2 className="mt-3 font-display text-3xl tracking-tight md:text-4xl">
            Built for organisers who demand reliability.
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((uc) => (
              <div
                key={uc.title}
                className="rounded-xl border border-border bg-background p-6"
              >
                <h3 className="font-semibold">{uc.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {uc.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="font-display text-3xl tracking-tight md:text-4xl">
            Ready to run your next competition?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">
            Set up your first quiz in minutes. No credit card required.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition hover:opacity-90"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border/50 bg-[var(--color-navy-950)] py-12 text-white/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-display text-sm text-white">Quizzly</span>
          </div>
          <p className="text-xs text-white/40">
            &copy; {new Date().getFullYear()} Quizzly. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Data ───

const FEATURES = [
  {
    icon: Trophy,
    title: "Competition Sessions",
    description:
      "Organize public quizzes, live tournaments, and online competitions with configurable open/close dates and multiple quiz sets.",
  },
  {
    icon: Users,
    title: "Participant Management",
    description:
      "Bulk import or self-register participants. Passcode-protected registration forms with capacity limits.",
  },
  {
    icon: Globe,
    title: "Multi-Nationality Support",
    description:
      "Built for international events — collect nationality, school, and demographic data with searchable country pickers.",
  },
  {
    icon: Zap,
    title: "Real-Time Live Mode",
    description:
      "Host live quiz rooms with round-by-round question reveal, locked answers, and instant leaderboards.",
  },
  {
    icon: Shield,
    title: "Secure & Fair",
    description:
      "Token-based session management, time-limited attempts, integrity flags, and negative marking support.",
  },
  {
    icon: BarChart3,
    title: "Detailed Analytics",
    description:
      "Per-question breakdown, speed bonuses, pass/fail thresholds, and exportable result sheets.",
  },
];

const STEPS = [
  {
    title: "Create a session",
    description: "Set title, type, dates, and assign one or more quiz sets.",
  },
  {
    title: "Open registration",
    description: "Share your registration link. Participants sign up themselves.",
  },
  {
    title: "Run the quiz",
    description: "Participants take the quiz solo or in a live tournament room.",
  },
  {
    title: "Review results",
    description: "Scores are computed instantly. Export or view analytics in the admin.",
  },
];

const USE_CASES = [
  {
    title: "Academic Olympiads",
    description:
      "Multi-stage international competitions with qualifying rounds and global finals.",
  },
  {
    title: "School Assessments",
    description:
      "Internal exams with per-question timing, negative marking, and instant feedback.",
  },
  {
    title: "Corporate Training",
    description:
      "Screening tests and certification exams with pass/fail thresholds and max attempts.",
  },
  {
    title: "Hackathon Challenges",
    description:
      "Timed problem sets for coding events with speed-based bonus scoring.",
  },
  {
    title: "Live Game Shows",
    description:
      "Real-time audience quizzes with leaderboard reveals and round-by-round suspense.",
  },
  {
    title: "Recruitment Screening",
    description:
      "Pre-interview technical assessments with integrity monitoring and time constraints.",
  },
];
