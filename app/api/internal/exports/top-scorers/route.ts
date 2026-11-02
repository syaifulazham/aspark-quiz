import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildTopScorersXlsx } from "@/lib/exports/top-scorers-xlsx";
import { parseCountries } from "@/app/(admin)/admin/results/top-scorers/params";

export const runtime = "nodejs";

/** GET /api/internal/exports/top-scorers?session=<id>&countries=BD,MY — admin session cookie required. */
export async function GET(request: NextRequest) {
  const auth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await auth.from("profiles").select("org_id").eq("id", user.id).single();
  const orgId = (profile as unknown as { org_id: string } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await buildTopScorersXlsx(
    orgId,
    request.nextUrl.searchParams.get("session") ?? "",
    parseCountries(request.nextUrl.searchParams.get("countries"))
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return new NextResponse(result.buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
