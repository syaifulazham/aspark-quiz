import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadParticipantFacets } from "@/lib/participant-facets";
import { PublicScoreboardsClient, type BoardRow, type SessionOption } from "./client";

export default async function PublicScoreboardsPage() {
  const auth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) notFound();
  const { data: profile } = await auth.from("profiles").select("org_id, role").eq("id", user.id).single();
  const caller = profile as unknown as { org_id: string; role: string } | null;
  if (!caller) notFound();

  const db = createAdminClient();
  const [{ data: boardRows }, { data: sessionRows }, facets] = await Promise.all([
    db
      .from("public_scoreboards")
      .select(
        "id, competition_session_id, title, slug, description, is_active, passcode_hash, top_n, countries, quiz_version_ids, auto_refresh, opens_at, closes_at, updated_at"
      )
      .eq("org_id", caller.org_id)
      .order("created_at", { ascending: false }),
    db
      .from("competition_sessions")
      .select("id, title, session_quiz_sets(quiz_version_id, label, position, quiz_version:quiz_versions(version, quiz:quizzes(title)))")
      .eq("org_id", caller.org_id)
      .order("created_at", { ascending: false }),
    loadParticipantFacets(db, caller.org_id, ["nationality"]),
  ]);

  const sessions: SessionOption[] = ((sessionRows ?? []) as unknown as Array<{
    id: string;
    title: string;
    session_quiz_sets: Array<{
      quiz_version_id: string;
      label: string | null;
      position: number;
      quiz_version: { version: number; quiz: { title: string } | null } | null;
    }>;
  }>).map((s) => ({
    id: s.id,
    title: s.title,
    quizzes: [...s.session_quiz_sets]
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        id: q.quiz_version_id,
        label: q.label || `${q.quiz_version?.quiz?.title ?? "Quiz"} (v${q.quiz_version?.version ?? "?"})`,
      })),
  }));

  const boards: BoardRow[] = ((boardRows ?? []) as unknown as Array<BoardRow & { passcode_hash: string | null }>).map(
    ({ passcode_hash, ...b }) => ({ ...b, has_passcode: !!passcode_hash })
  );

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;

  return (
    <PublicScoreboardsClient
      boards={boards}
      sessions={sessions}
      countries={facets.nationality}
      origin={origin}
      canManage={caller.role === "owner" || caller.role === "admin"}
    />
  );
}
