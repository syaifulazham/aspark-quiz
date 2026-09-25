import { Fragment } from "react";
import { School } from "lucide-react";
import { getRegistrations, getSchoolParticipants, registrationStatus } from "./data";
import {
  EmptyRow,
  PlainLink,
  ScoreCell,
  Section,
  StatCards,
  StatusPill,
  fmtDate,
  fmtDuration,
  participantHref,
  summarizeRegistrations,
  td,
  th,
} from "./ui";

export async function SchoolView({ orgId, school, q }: { orgId: string; school: string; q?: string }) {
  const participants = await getSchoolParticipants(orgId, school);
  const regs = await getRegistrations(orgId, participants.map((p) => p.id));
  const all = participants.flatMap((p) => regs.get(p.id) ?? []);
  const summary = summarizeRegistrations(all);
  const countries = [...new Set(participants.map((p) => p.nationality).filter(Boolean))].sort();
  const grades = [...new Set(participants.map((p) => p.grade).filter(Boolean))].sort((a, b) =>
    a!.localeCompare(b!, undefined, { numeric: true })
  );

  return (
    <div className="mt-6 space-y-6">
      <Section
        title={school}
        description={
          participants.length === 0
            ? "No participants found for this school."
            : [
                `${participants.length} ${participants.length === 1 ? "participant" : "participants"}`,
                countries.length ? countries.join(", ") : null,
                grades.length ? grades.join(", ") : null,
              ]
                .filter(Boolean)
                .join(" · ")
        }
        actions={<School className="size-5 text-muted-foreground" />}
      >
        <StatCards
          items={[
            { label: "Participants", value: String(participants.length) },
            { label: "Quiz registrations", value: String(summary.registered) },
            { label: "Submitted", value: String(summary.submitted) },
            { label: "Average score", value: summary.avgPct != null ? `${summary.avgPct}%` : "—" },
          ]}
        />
      </Section>

      <Section
        title="Participants, quizzes & results"
        description="Each participant with the quizzes they are registered for and their outcome."
        delay={60}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--secondary)]">
              <tr>
                <th className={th}>Participant</th>
                <th className={th}>Grade</th>
                <th className={th}>Quiz</th>
                <th className={th}>Session</th>
                <th className={th}>Status</th>
                <th className={th}>Score</th>
                <th className={th}>Time</th>
                <th className={th}>Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {participants.length === 0 ? (
                <EmptyRow colSpan={8}>No participants.</EmptyRow>
              ) : (
                participants.map((p) => {
                  const list = regs.get(p.id) ?? [];
                  const span = Math.max(list.length, 1);
                  const person = (
                    <>
                      <td rowSpan={span} className={`${td} border-r border-[var(--border)]`}>
                        <PlainLink href={participantHref(p.id, q)} className="font-medium">
                          {p.full_name}
                        </PlainLink>
                        <span className="block font-mono text-xs text-muted-foreground">{p.personal_id}</span>
                        {p.nationality && <span className="text-xs text-muted-foreground">{p.nationality}</span>}
                      </td>
                      <td rowSpan={span} className={`${td} border-r border-[var(--border)] whitespace-nowrap`}>
                        {p.grade ?? "—"}
                      </td>
                    </>
                  );
                  if (list.length === 0) {
                    return (
                      <tr key={p.id} className="hover:bg-[var(--secondary)]">
                        {person}
                        <td colSpan={6} className={`${td} text-muted-foreground`}>
                          Not registered for any quiz yet.
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <Fragment key={p.id}>
                      {list.map((r, i) => (
                        <tr key={r.tokenId} className="hover:bg-[var(--secondary)]">
                          {i === 0 && person}
                          <td className={`${td} font-medium`}>{r.quizTitle}</td>
                          <td className={`${td} text-muted-foreground`}>{r.sessionTitle ?? "—"}</td>
                          <td className={td}>
                            <StatusPill status={registrationStatus(r)} />
                          </td>
                          <td className={td}>
                            <ScoreCell r={r} />
                          </td>
                          <td className={`${td} font-mono text-muted-foreground`}>
                            {fmtDuration(r.attempt?.durationMs ?? null)}
                          </td>
                          <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                            {fmtDate(r.attempt?.submittedAt ?? null)}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
