import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json({ type: "unauthorized", title: "Invalid API key", status: 401 }, { status: 401 });
  }

  if (!ctx.scopes.includes("results:read")) {
    return NextResponse.json({ type: "forbidden", title: "Insufficient scope", status: 403 }, { status: 403 });
  }

  if (ctx.quizIds && !ctx.quizIds.includes(id)) {
    return NextResponse.json({ type: "forbidden", title: "Quiz not in key's allowlist", status: 403 }, { status: 403 });
  }

  const supabase = createAdminClient();
  const searchParams = request.nextUrl.searchParams;
  const school = searchParams.get("school");
  const agency = searchParams.get("agency");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  // Get quiz info
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .single();

  if (!quiz) {
    return NextResponse.json({ type: "not_found", title: "Quiz not found", status: 404 }, { status: 404 });
  }

  // Get published versions
  const { data: versions } = await supabase
    .from("quiz_versions")
    .select("id, version")
    .eq("quiz_id", id)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1);

  const latestVersion = ((versions ?? []) as unknown as Array<{ id: string; version: number }>)[0];
  if (!latestVersion) {
    return NextResponse.json({ type: "not_found", title: "No published version", status: 404 }, { status: 404 });
  }

  // Get best sessions per participant (highest percentage, then shortest duration)
  let query = supabase
    .from("quiz_sessions")
    .select("participant_id, percentage, duration_ms, submitted_at, participants!inner(personal_id, full_name, school, agency)")
    .eq("quiz_version_id", latestVersion.id)
    .eq("org_id", ctx.orgId)
    .eq("state", "submitted")
    .not("percentage", "is", null)
    .order("percentage", { ascending: false })
    .order("duration_ms", { ascending: true })
    .order("submitted_at", { ascending: true })
    .limit(limit);

  if (school) query = query.eq("participants.school", school);
  if (agency) query = query.eq("participants.agency", agency);

  const { data: sessions } = await query;
  const rows = (sessions ?? []) as unknown as Array<{
    participant_id: string;
    percentage: number;
    duration_ms: number;
    submitted_at: string;
    participants: { personal_id: string; full_name: string; school: string | null; agency: string | null };
  }>;

  // Deduplicate per participant (keep best)
  const seen = new Set<string>();
  const leaderboard = rows
    .filter((r) => {
      if (seen.has(r.participant_id)) return false;
      seen.add(r.participant_id);
      return true;
    })
    .map((r, i) => ({
      rank: i + 1,
      participant_id: r.participant_id,
      personal_id: r.participants.personal_id,
      full_name: r.participants.full_name,
      school: r.participants.school,
      percentage: r.percentage,
      duration_seconds: Math.round((r.duration_ms || 0) / 1000),
    }));

  const scope: Record<string, string> = {};
  if (school) scope.school = school;
  if (agency) scope.agency = agency;

  return NextResponse.json({
    quiz: { id: (quiz as unknown as { id: string; title: string }).id, title: (quiz as unknown as { id: string; title: string }).title, version: latestVersion.version },
    scope: Object.keys(scope).length > 0 ? scope : undefined,
    generated_at: new Date().toISOString(),
    data: leaderboard,
  });
}
