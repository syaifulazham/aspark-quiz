import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { type: "unauthorized", title: "Invalid API key", status: 401 },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("results:read")) {
    return NextResponse.json(
      { type: "forbidden", title: "Insufficient scope", status: 403, detail: "Requires results:read scope" },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();
  const searchParams = request.nextUrl.searchParams;

  const quizId = searchParams.get("quiz_id");
  const state = searchParams.get("state");
  const school = searchParams.get("school");
  const agency = searchParams.get("agency");
  const submittedAfter = searchParams.get("submitted_after");
  const submittedBefore = searchParams.get("submitted_before");
  const minPercentage = searchParams.get("min_percentage");
  const passed = searchParams.get("passed");
  const sortBy = searchParams.get("sort") || "submitted_at";
  const order = searchParams.get("order") === "asc" ? true : false;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const cursor = searchParams.get("cursor");

  let query = supabase
    .from("quiz_sessions")
    .select("*, participants!inner(personal_id, full_name, school, agency)")
    .eq("org_id", ctx.orgId)
    .limit(limit + 1);

  // Filters
  if (quizId) {
    const { data: versions } = await supabase
      .from("quiz_versions")
      .select("id")
      .eq("quiz_id", quizId);
    const versionIds = ((versions ?? []) as unknown as Array<{ id: string }>).map((v) => v.id);
    if (versionIds.length > 0) {
      query = query.in("quiz_version_id", versionIds);
    }
  }

  if (state) query = query.eq("state", state);
  if (submittedAfter) query = query.gte("submitted_at", submittedAfter);
  if (submittedBefore) query = query.lte("submitted_at", submittedBefore);
  if (minPercentage) query = query.gte("percentage", parseFloat(minPercentage));
  if (passed === "true") query = query.eq("passed", true);
  if (passed === "false") query = query.eq("passed", false);

  // School/agency filter via participant join
  if (school) query = query.eq("participants.school", school);
  if (agency) query = query.eq("participants.agency", agency);

  // Sorting
  const sortField = ["submitted_at", "percentage", "duration_ms"].includes(sortBy) ? sortBy : "submitted_at";
  query = query.order(sortField, { ascending: order });

  if (cursor) {
    query = query.gt("id", cursor);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { type: "server_error", title: "Query failed", status: 500, detail: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(items[items.length - 1]?.id) : null;

  return NextResponse.json({
    data: items.map((s) => ({
      session_id: s.id,
      participant_id: s.participant_id,
      participant: s.participants,
      mode: s.mode,
      state: s.state,
      score: {
        raw: s.raw_score,
        max: s.max_score,
        percentage: s.percentage,
        passed: s.passed,
        correct: s.correct_count,
        incorrect: s.incorrect_count,
        unanswered: s.unanswered_count,
      },
      timing: {
        started_at: s.started_at,
        submitted_at: s.submitted_at,
        duration_ms: s.duration_ms,
      },
      integrity_flags: s.integrity_flags,
    })),
    pagination: { next_cursor: nextCursor, has_more: hasMore, limit },
  });
}
