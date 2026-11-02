import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
type FacetColumn = "nationality" | "school" | "grade";

const PAGE = 1000; // PostgREST returns at most this many rows per request

/**
 * Distinct non-empty values of participant columns for an organisation, for filter dropdowns.
 * Reads every page — a single select stops silently at the server's row limit.
 */
export async function loadParticipantFacets<C extends FacetColumn>(
  db: Admin,
  orgId: string,
  columns: readonly C[]
): Promise<Record<C, string[]>> {
  const sets = Object.fromEntries(columns.map((c) => [c, new Set<string>()])) as Record<C, Set<string>>;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("participants")
      .select(`id, ${columns.join(", ")}`)
      .eq("org_id", orgId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<Record<C, string | null>>;
    for (const row of rows) {
      for (const c of columns) {
        const v = row[c]?.trim();
        if (v) sets[c].add(v);
      }
    }
    if (rows.length < PAGE) break;
  }

  return Object.fromEntries(
    columns.map((c) => [c, [...sets[c]].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))])
  ) as Record<C, string[]>;
}
