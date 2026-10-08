import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, Minus, X } from "lucide-react";
import { renderMathInText } from "@/lib/katex";
import { cn } from "@/lib/utils";
import { countryLabel } from "@/app/(admin)/admin/live/country";
import { loadReport, type ParticipantReport, type PaperDetails, type ReportItem, type ReportInclude } from "./data";
import { ReportToolbar } from "./report-toolbar";
import { LocalTime } from "./local-time";

interface Props {
  searchParams: Promise<{ session?: string; quiz?: string; country?: string; participant?: string; include?: string }>;
}

async function readParams(searchParams: Props["searchParams"]) {
  const sp = await searchParams;
  return {
    sessionId: sp.session ?? "",
    quizVersionId: sp.quiz ?? "",
    country: sp.country?.trim() || null,
    participantId: sp.participant?.trim() || null,
    include: (sp.include === "all" ? "all" : "submitted") as ReportInclude,
  };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await readParams(searchParams);
  if (!params.sessionId || !params.quizVersionId) return { title: "Answer scripts" };
  const report = await loadReport(params);
  if (!report.ok) return { title: "Answer scripts" };
  // The title becomes the default file name when the browser saves the page as a PDF.
  const who =
    params.participantId && report.participants[0]
      ? `${report.participants[0].fullName} (${report.participants[0].personalId})`
      : params.country
        ? `${params.country} participants`
        : "All participants";
  return { title: `Answers - ${report.paper.sessionTitle} - ${report.paper.paperLabel} - ${who}` };
}

function Tex({ text, className }: { text: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: renderMathInText(text) }} />;
}

const mediaUrl = (key: string) => `https://${process.env.NEXT_PUBLIC_R2_PUBLIC_HOST}/${key}`;

function fmtNumber(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/\.?0+$/, "");
}

function fmtDuration(ms: number | null) {
  if (ms == null) return "—";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean);
  return parts.length ? parts.join(" ") : "0s";
}

const STATE_LABEL: Record<ParticipantReport["attemptState"], string> = {
  not_started: "Not started",
  logged_in: "Logged in, not started",
  in_progress: "In progress (not submitted)",
  submitted: "Submitted",
  voided: "Voided",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] leading-snug">{children || "—"}</dd>
    </div>
  );
}

function ResultBadge({ item }: { item: ReportItem }) {
  const total = item.pointsAwarded + item.speedBonus;
  const styles = {
    correct: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    incorrect: "bg-rose-50 text-rose-700 ring-rose-200",
    unanswered: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  }[item.result];
  const Icon = item.result === "correct" ? Check : item.result === "incorrect" ? X : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", styles)}>
      <Icon className="size-3" />
      {item.result === "correct" ? "Correct" : item.result === "incorrect" ? "Incorrect" : "Not answered"}
      <span className="font-mono">
        · {total > 0 ? "+" : ""}
        {fmtNumber(total)} / {fmtNumber(item.question.points)}
      </span>
    </span>
  );
}

function OptionsBlock({ item }: { item: ReportItem }) {
  const { question } = item;
  return (
    <ol className="mt-2.5 grid gap-1.5">
      {question.options.map((o) => {
        const selected = item.selectedOptionId === o.id;
        const tone = o.isCorrect
          ? "border-emerald-300 bg-emerald-50/70"
          : selected
            ? "border-rose-300 bg-rose-50/70"
            : "border-zinc-200";
        return (
          <li key={o.id} className={cn("flex items-start gap-2.5 rounded-md border px-2.5 py-1.5 text-[13px]", tone)}>
            <span
              className={cn(
                "mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                selected ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-600"
              )}
            >
              {o.letter}
            </span>
            <span className="min-w-0 flex-1 space-y-1.5">
              {o.mediaKey && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(o.mediaKey)} alt={o.mediaAlt ?? ""} className="max-h-32 rounded border border-zinc-200 object-contain" />
              )}
              {o.text && <Tex text={o.text} className="block leading-snug" />}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {selected && <span className={o.isCorrect ? "text-emerald-700" : "text-rose-700"}>Participant&apos;s answer</span>}
              {o.isCorrect && <span className="text-emerald-700">Correct answer</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function NumericBlock({ item }: { item: ReportItem }) {
  const q = item.question;
  const unit = q.numericUnit ? ` ${q.numericUnit}` : "";
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-2 text-[13px]">
      <div
        className={cn(
          "rounded-md border px-2.5 py-1.5",
          item.result === "correct" ? "border-emerald-300 bg-emerald-50/70" : item.result === "incorrect" ? "border-rose-300 bg-rose-50/70" : "border-zinc-200"
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Participant&apos;s answer</p>
        <p className="font-mono">{item.numericResponse != null ? `${fmtNumber(item.numericResponse, 6)}${unit}` : "—"}</p>
      </div>
      <div className="rounded-md border border-emerald-300 bg-emerald-50/70 px-2.5 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Correct answer</p>
        <p className="font-mono">
          {fmtNumber(q.numericAnswer, 6)}
          {q.numericTolerance ? ` ± ${fmtNumber(q.numericTolerance, 6)}` : ""}
          {unit}
        </p>
      </div>
    </div>
  );
}

function QuestionBlock({ item }: { item: ReportItem }) {
  const q = item.question;
  return (
    <section className="break-inside-avoid border-t border-zinc-200 py-3.5 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-zinc-700">
          Question {item.number}
          <span className="ml-2 font-normal text-zinc-500">
            {fmtNumber(q.points)} {q.points === 1 ? "mark" : "marks"}
            {item.timeTakenMs != null && ` · ${fmtDuration(item.timeTakenMs)}`}
          </span>
        </p>
        <ResultBadge item={item} />
      </div>
      {q.stem && <Tex text={q.stem} className="mt-1.5 block whitespace-pre-wrap text-[14px] leading-relaxed" />}
      {q.mediaKey && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(q.mediaKey)} alt={q.mediaAlt ?? "Question image"} className="mt-2 max-h-64 rounded border border-zinc-200 object-contain" />
      )}
      {q.kind === "numeric" ? <NumericBlock item={item} /> : <OptionsBlock item={item} />}
    </section>
  );
}

function Script({ paper, p, first }: { paper: PaperDetails; p: ParticipantReport; first: boolean }) {
  const max = p.maxScore ?? paper.totalPoints;
  const scored = p.rawScore ?? p.items.reduce((s, i) => s + i.pointsAwarded + i.speedBonus, 0);
  const pct = p.percentage ?? (max ? (scored / max) * 100 : null);
  const provisional = p.attemptState !== "submitted";

  return (
    <article
      className={cn(
        "mx-auto mb-8 w-full max-w-[210mm] bg-white px-[12mm] py-[12mm] shadow-sm ring-1 ring-zinc-200",
        "print:mb-0 print:max-w-none print:p-0 print:shadow-none print:ring-0",
        !first && "print:break-before-page"
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b-2 border-zinc-900 pb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Answer script</p>
          <h1 className="mt-0.5 text-lg font-semibold leading-tight">{paper.sessionTitle}</h1>
          <p className="text-[13px] text-zinc-600">{paper.paperLabel}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {provisional ? "Score so far" : "Score"}
          </p>
          <p className="font-mono text-2xl font-semibold leading-tight">
            {fmtNumber(scored)}
            <span className="text-base text-zinc-400"> / {fmtNumber(max)}</span>
          </p>
          <p className="text-[13px] text-zinc-600">
            {pct != null ? `${fmtNumber(pct)}%` : "—"}
            {p.passed != null && (
              <span className={cn("ml-2 font-semibold", p.passed ? "text-emerald-700" : "text-rose-700")}>
                {p.passed ? "Pass" : "Did not pass"}
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-900">Participant</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="col-span-2">
              <Field label="Name">{p.fullName}</Field>
            </div>
            <Field label="ID">
              <span className="font-mono">{p.personalId}</span>
            </Field>
            <Field label="Grade">{p.grade}</Field>
            <div className="col-span-2">
              <Field label="School">{p.school}</Field>
            </div>
            <div className="col-span-2">
              <Field label="Country">{p.country ? countryLabel(p.country) : null}</Field>
            </div>
          </dl>
        </section>
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-900">Paper</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="col-span-2">
              <Field label="Quiz">
                {paper.quizTitle} <span className="text-zinc-500">(v{paper.quizVersion})</span>
              </Field>
            </div>
            <Field label="Questions">{p.items.length}</Field>
            <Field label="Total marks">{fmtNumber(max)}</Field>
            <Field label="Time limit">{paper.timeLimitSeconds ? fmtDuration(paper.timeLimitSeconds * 1000) : "None"}</Field>
            <Field label="Negative marking">{paper.negativeMarking ? `−${fmtNumber(paper.negativeMarking)}` : "None"}</Field>
          </dl>
        </section>
      </div>

      <section className="mt-4 rounded-md bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200">
        <dl className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-6 print:grid-cols-6">
          <Field label="Status">{STATE_LABEL[p.attemptState]}</Field>
          <Field label="Correct">
            <span className="font-mono text-emerald-700">{p.correct}</span>
          </Field>
          <Field label="Incorrect">
            <span className="font-mono text-rose-700">{p.incorrect}</span>
          </Field>
          <Field label="Not answered">
            <span className="font-mono">{p.unanswered}</span>
          </Field>
          <Field label="Started">
            <LocalTime iso={p.startedAt} />
          </Field>
          <Field label={provisional ? "Duration" : "Submitted"}>
            {provisional ? fmtDuration(p.durationMs) : <LocalTime iso={p.submittedAt} />}
          </Field>
        </dl>
        {!provisional && p.durationMs != null && (
          <p className="mt-1.5 text-[11px] text-zinc-500">Time taken: {fmtDuration(p.durationMs)}</p>
        )}
      </section>

      <div className="mt-3">
        {p.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No questions were assigned in this attempt.</p>
        ) : (
          p.items.map((item) => <QuestionBlock key={item.question.id} item={item} />)
        )}
      </div>

      <footer className="mt-4 border-t border-zinc-200 pt-2 text-[10px] text-zinc-400">
        {p.fullName} · {p.personalId} · {paper.sessionTitle} · {paper.paperLabel}
      </footer>
    </article>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-[210mm] rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-16 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

export default async function AnswerReportPage({ searchParams }: Props) {
  const params = await readParams(searchParams);
  const back = new URLSearchParams();
  if (params.country) back.set("country", params.country);
  if (params.sessionId) back.set("session", params.sessionId);
  if (params.quizVersionId) back.set("quiz", params.quizVersionId);
  const backHref = `/admin/live?${back}`;

  if (!params.sessionId || !params.quizVersionId) {
    return (
      <>
        <ReportToolbar backHref={backHref} title="Answer scripts" summary="" toggle={null} canPrint={false} />
        <Message>Pick a session and quiz on the Live page first.</Message>
      </>
    );
  }

  const report = await loadReport(params);
  if (!report.ok) {
    if (report.status === 401) redirect("/admin/login");
    return (
      <>
        <ReportToolbar backHref={backHref} title="Answer scripts" summary="" toggle={null} canPrint={false} />
        <Message>{report.message}</Message>
      </>
    );
  }

  const { paper, participants, skipped } = report;
  const toggleParams = new URLSearchParams(back);
  if (params.include === "submitted") toggleParams.set("include", "all");
  const toggle = params.participantId
    ? null
    : params.include === "submitted"
      ? { href: `/admin/live/report?${toggleParams}`, label: "Include unsubmitted" }
      : { href: `/admin/live/report?${toggleParams}`, label: "Submitted only" };

  const scope = params.participantId
    ? participants[0]?.fullName ?? "Participant"
    : `${participants.length} ${participants.length === 1 ? "participant" : "participants"}${params.country ? ` from ${countryLabel(params.country)}` : ""}`;
  const skippedNote =
    !params.participantId && skipped > 0
      ? ` · ${skipped} without ${params.include === "submitted" ? "a submitted attempt" : "an attempt"} not included`
      : "";

  return (
    <>
      <ReportToolbar
        backHref={backHref}
        title={`${paper.sessionTitle} › ${paper.paperLabel}`}
        summary={`${scope}${skippedNote}`}
        toggle={toggle}
        canPrint={participants.length > 0}
      />
      <main className="px-4 py-8 print:p-0">
        {participants.length === 0 ? (
          <Message>
            {params.participantId
              ? "This participant has not started the quiz yet, so there are no answers to show."
              : params.include === "submitted"
                ? "Nobody has submitted this quiz yet. Use “Include unsubmitted” to see attempts in progress."
                : "Nobody has started this quiz yet."}
          </Message>
        ) : (
          participants.map((p, i) => <Script key={p.participantId} paper={paper} p={p} first={i === 0} />)
        )}
      </main>
    </>
  );
}
