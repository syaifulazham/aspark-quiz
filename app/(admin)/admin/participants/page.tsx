import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Participant = Database["public"]["Tables"]["participants"]["Row"];

export default async function ParticipantsPage() {
  const supabase = await createServerSupabaseClient();
  const { data, count } = await supabase
    .from("participants")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(50);

  const participants = (data ?? []) as Participant[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Participants
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {count ?? 0} registered participants
          </p>
        </div>
        <Link href="/admin/participants/registration-forms">
          <Button variant="outline" size="sm">
            Registration Forms
          </Button>
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--secondary)]">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Personal ID
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Name
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                School
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Agency
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                Registered
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {participants.length > 0 ? (
              participants.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--secondary)]">
                  <td className="px-4 py-3 font-mono text-xs">
                    {p.personal_id}
                  </td>
                  <td className="px-4 py-3">{p.full_name}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {p.school || "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {p.agency || "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                >
                  No participants yet. They will appear here once registered via
                  the API.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
