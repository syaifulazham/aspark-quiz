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

  if (!ctx.scopes.includes("quizzes:read")) {
    return NextResponse.json(
      { type: "forbidden", title: "Insufficient scope", status: 403, detail: "Requires quizzes:read scope" },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, slug, title, description, created_at, quiz_versions(id, version, status, time_limit_seconds, published_at)")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  const rows = (quizzes ?? []) as unknown as Array<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    created_at: string;
    quiz_versions: Array<{
      id: string;
      version: number;
      status: string;
      time_limit_seconds: number | null;
      published_at: string | null;
    }>;
  }>;

  // If key is scoped to specific quiz_ids, filter
  const filtered = ctx.quizIds
    ? rows.filter((q) => ctx.quizIds!.includes(q.id))
    : rows;

  const data = filtered.map((q) => {
    const publishedVersions = q.quiz_versions
      .filter((v) => v.status === "published")
      .sort((a, b) => b.version - a.version);
    const latest = publishedVersions[0];

    return {
      id: q.id,
      slug: q.slug,
      title: q.title,
      latest_published_version: latest?.version || null,
      time_limit_seconds: latest?.time_limit_seconds || null,
      published_at: latest?.published_at || null,
    };
  });

  return NextResponse.json({ data });
}
