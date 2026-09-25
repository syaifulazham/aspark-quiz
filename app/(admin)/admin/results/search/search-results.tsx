import { School, User } from "lucide-react";
import {
  MAX_PARTICIPANT_HITS,
  getRegistrations,
  searchParticipants,
  searchSchools,
} from "./data";
import {
  EmptyRow,
  PlainLink,
  Section,
  participantHref,
  schoolHref,
  summarizeRegistrations,
  td,
  th,
} from "./ui";

export async function SearchResults({ orgId, q }: { orgId: string; q: string }) {
  const [{ participants, truncated }, schools] = await Promise.all([
    searchParticipants(orgId, q),
    searchSchools(orgId, q),
  ]);
  const regs = await getRegistrations(orgId, participants.map((p) => p.id));

  if (participants.length === 0 && schools.length === 0) {
    return (
      <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-14 text-center text-sm text-muted-foreground animate-in fade-in">
        No participants or schools match <span className="font-medium text-foreground">“{q}”</span>.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {schools.length > 0 && (
        <Section
          title="Schools"
          description={`${schools.length} matching ${schools.length === 1 ? "school" : "schools"}`}
        >
          <ul className="grid grid-cols-1 gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
            {schools.map((s) => (
              <li key={s.name}>
                <PlainLink
                  href={schoolHref(s.name, q)}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2.5 transition-colors hover:bg-[var(--secondary)] hover:no-underline"
                >
                  <School className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.participants} {s.participants === 1 ? "participant" : "participants"}
                      {s.countries.length > 0 && ` · ${s.countries.join(", ")}`}
                    </span>
                  </span>
                </PlainLink>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Participants"
        description={
          truncated
            ? `Showing the first ${MAX_PARTICIPANT_HITS} matches. Add more words to narrow down.`
            : `${participants.length} matching ${participants.length === 1 ? "participant" : "participants"}`
        }
        delay={60}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--secondary)]">
              <tr>
                <th className={th}>Participant</th>
                <th className={th}>Grade</th>
                <th className={th}>School</th>
                <th className={th}>Country</th>
                <th className={th}>Quizzes</th>
                <th className={th}>Avg. score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {participants.length === 0 ? (
                <EmptyRow colSpan={6}>No participants match.</EmptyRow>
              ) : (
                participants.map((p) => {
                  const s = summarizeRegistrations(regs.get(p.id) ?? []);
                  return (
                    <tr key={p.id} className="hover:bg-[var(--secondary)]">
                      <td className={td}>
                        <PlainLink href={participantHref(p.id, q)} className="flex items-start gap-2 font-medium">
                          <User className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span>
                            {p.full_name}
                            <span className="block font-mono text-xs font-normal text-muted-foreground">
                              {p.personal_id}
                            </span>
                          </span>
                        </PlainLink>
                      </td>
                      <td className={td}>{p.grade ?? "—"}</td>
                      <td className={td}>
                        {p.school ? <PlainLink href={schoolHref(p.school, q)}>{p.school}</PlainLink> : "—"}
                      </td>
                      <td className={`${td} font-mono text-xs`}>{p.nationality ?? "—"}</td>
                      <td className={td}>
                        {s.registered === 0 ? (
                          <span className="text-muted-foreground">None registered</span>
                        ) : (
                          <span>
                            <span className="font-mono">{s.submitted}</span>
                            <span className="text-muted-foreground">/{s.registered} submitted</span>
                          </span>
                        )}
                      </td>
                      <td className={`${td} font-mono`}>{s.avgPct != null ? `${s.avgPct}%` : "—"}</td>
                    </tr>
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
