import { getParticipant, getRegistrations, registrationStatus } from "./data";
import {
  EmptyRow,
  PlainLink,
  ScoreCell,
  Section,
  StatCards,
  StatusPill,
  fmtDate,
  fmtDuration,
  schoolHref,
  summarizeRegistrations,
  td,
  th,
} from "./ui";

function Field({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "mt-0.5 break-all font-mono text-sm" : "mt-0.5 text-sm"}>
        {children ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

export async function ParticipantView({ orgId, id, q }: { orgId: string; id: string; q?: string }) {
  const p = await getParticipant(orgId, id);
  if (!p) {
    return (
      <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-14 text-center text-sm text-muted-foreground">
        Participant not found.
      </div>
    );
  }

  const regs = (await getRegistrations(orgId, [p.id])).get(p.id) ?? [];
  const summary = summarizeRegistrations(regs);
  const metadata = Object.entries(p.metadata ?? {}).filter(([, v]) => v !== null && v !== "");

  return (
    <div className="mt-6 space-y-6">
      <Section
        title={p.full_name}
        description={<span className="font-mono">{p.personal_id}</span>}
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 md:grid-cols-3 xl:grid-cols-4">
          <Field label="Full name">{p.full_name}</Field>
          <Field label="Personal ID" mono>{p.personal_id}</Field>
          <Field label="Grade">{p.grade}</Field>
          <Field label="School">
            {p.school ? <PlainLink href={schoolHref(p.school, q)}>{p.school}</PlainLink> : null}
          </Field>
          <Field label="Country">{p.nationality}</Field>
          <Field label="Gender">{p.gender ? p.gender[0]!.toUpperCase() + p.gender.slice(1) : null}</Field>
          <Field label="Date of birth">{p.date_of_birth}</Field>
          <Field label="Age">{p.age}</Field>
          <Field label="Email" mono>{p.email}</Field>
          <Field label="Phone" mono>{p.phone}</Field>
          <Field label="Agency">{p.agency}</Field>
          <Field label="External ref" mono>{p.external_ref}</Field>
          <Field label="Registered via session">{p.competition_session?.title}</Field>
          <Field label="Created">{fmtDate(p.created_at)}</Field>
          <Field label="Updated">{fmtDate(p.updated_at)}</Field>
          <Field label="Quizzly ID" mono>
            <span className="text-xs">{p.id}</span>
          </Field>
        </dl>
        {metadata.length > 0 && (
          <div className="border-t border-[var(--border)] px-5 py-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Additional fields</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 xl:grid-cols-4">
              {metadata.map(([k, v]) => (
                <Field key={k} label={k}>
                  {typeof v === "object" ? <code className="text-xs">{JSON.stringify(v)}</code> : String(v)}
                </Field>
              ))}
            </dl>
          </div>
        )}
      </Section>

      <Section
        title="Quizzes & results"
        description="Every quiz this participant was registered for (issued a login code), and the outcome."
        delay={60}
      >
        <StatCards
          items={[
            { label: "Registered", value: String(summary.registered) },
            { label: "Submitted", value: String(summary.submitted) },
            { label: "Average score", value: summary.avgPct != null ? `${summary.avgPct}%` : "—" },
            { label: "Best score", value: summary.best != null ? `${summary.best}%` : "—" },
          ]}
        />
        <div className="overflow-x-auto border-t border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--secondary)]">
              <tr>
                <th className={th}>Quiz</th>
                <th className={th}>Session</th>
                <th className={th}>Status</th>
                <th className={th}>Score</th>
                <th className={th}>Time</th>
                <th className={th}>Submitted</th>
                <th className={th}>Code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {regs.length === 0 ? (
                <EmptyRow colSpan={7}>Not registered for any quiz yet.</EmptyRow>
              ) : (
                regs.map((r) => (
                  <tr key={r.tokenId} className="hover:bg-[var(--secondary)]">
                    <td className={`${td} font-medium`}>
                      {r.quizTitle}
                      {r.quizVersion != null && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">v{r.quizVersion}</span>
                      )}
                    </td>
                    <td className={`${td} text-muted-foreground`}>{r.sessionTitle ?? "—"}</td>
                    <td className={td}>
                      <StatusPill status={registrationStatus(r)} />
                    </td>
                    <td className={td}>
                      <ScoreCell r={r} />
                    </td>
                    <td className={`${td} font-mono text-muted-foreground`}>{fmtDuration(r.attempt?.durationMs ?? null)}</td>
                    <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                      {fmtDate(r.attempt?.submittedAt ?? null)}
                    </td>
                    <td className={`${td} font-mono text-xs text-muted-foreground`} title={`Issued ${fmtDate(r.issuedAt)} · expires ${fmtDate(r.expiresAt)}`}>
                      {r.code}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
