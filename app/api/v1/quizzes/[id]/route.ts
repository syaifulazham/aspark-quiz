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
    return NextResponse.json(
      { type: "unauthorized", title: "Invalid API key", status: 401 },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("quizzes:read")) {
    return NextResponse.json(
      { type: "forbidden", title: "Insufficient scope", status: 403, detail: "Requires quizzes:read scope" },
      { status: 403 }
    );
  }

  // Check quiz_ids scope
  if (ctx.quizIds && !ctx.quizIds.includes(id)) {
    return NextResponse.json(
      { type: "forbidden", title: "Quiz not in key's allowlist", status: 403 },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select("id, slug, title, description, created_at")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .single();

  if (error || !quiz) {
    return NextResponse.json(
      { type: "not_found", title: "Quiz not found", status: 404 },
      { status: 404 }
    );
  }

  // Get versions
  const { data: versions } = await supabase
    .from("quiz_versions")
    .select("id, version, status, time_limit_seconds, per_question_seconds, shuffle_questions, shuffle_options, allow_backtrack, max_attempts, passing_score, published_at")
    .eq("quiz_id", id)
    .order("version", { ascending: false });

  const q = quiz as unknown as { id: string; slug: string; title: string; description: string | null; created_at: string };

  return NextResponse.json({
    ...q,
    versions: (versions ?? []).map((v) => {
      const ver = v as unknown as Record<string, unknown>;
      return {
        id: ver.id,
        version: ver.version,
        status: ver.status,
        time_limit_seconds: ver.time_limit_seconds,
        per_question_seconds: ver.per_question_seconds,
        shuffle_questions: ver.shuffle_questions,
        shuffle_options: ver.shuffle_options,
        allow_backtrack: ver.allow_backtrack,
        max_attempts: ver.max_attempts,
        passing_score: ver.passing_score,
        published_at: ver.published_at,
      };
    }),
  });
}
