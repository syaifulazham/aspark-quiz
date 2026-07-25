import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { type: "unauthorized", title: "Invalid API key", status: 401 },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("participants:write")) {
    return NextResponse.json(
      { type: "forbidden", title: "Insufficient scope", status: 403, detail: "Requires participants:write scope" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { participants, upsert = false } = body;

  if (!Array.isArray(participants) || participants.length === 0) {
    return NextResponse.json(
      { type: "validation_error", title: "participants array is required", status: 400 },
      { status: 400 }
    );
  }

  if (participants.length > 500) {
    return NextResponse.json(
      { type: "validation_error", title: "Maximum 500 participants per batch", status: 400 },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const results: Array<{ index: number; status: string; id?: string; personal_id: string; error?: { code: string; detail: string } }> = [];
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];

    if (!p.personal_id || !p.full_name) {
      failed++;
      results.push({
        index: i,
        status: "failed",
        personal_id: p.personal_id || "",
        error: { code: "missing_required", detail: "personal_id and full_name are required" },
      });
      continue;
    }

    const row = {
      org_id: ctx.orgId,
      personal_id: p.personal_id,
      full_name: p.full_name,
      nationality: p.nationality || null,
      date_of_birth: p.date_of_birth || null,
      age: p.age || null,
      gender: p.gender || null,
      school: p.school || null,
      agency: p.agency || null,
      email: p.email || null,
      phone: p.phone || null,
      external_ref: p.external_ref || null,
      metadata: p.metadata || {},
    };

    if (upsert) {
      const { data, error } = await supabase
        .from("participants")
        .upsert(row as never, { onConflict: "org_id,personal_id" })
        .select("id")
        .single();

      if (error) {
        failed++;
        results.push({ index: i, status: "failed", personal_id: p.personal_id, error: { code: "db_error", detail: error.message } });
      } else {
        // Determine if it was created or updated
        const { count } = await supabase
          .from("participants")
          .select("*", { count: "exact", head: true })
          .eq("id", (data as unknown as { id: string }).id)
          .lt("updated_at", new Date(Date.now() - 1000).toISOString());

        if (count && count > 0) {
          updated++;
          results.push({ index: i, status: "updated", id: (data as unknown as { id: string }).id, personal_id: p.personal_id });
        } else {
          created++;
          results.push({ index: i, status: "created", id: (data as unknown as { id: string }).id, personal_id: p.personal_id });
        }
      }
    } else {
      const { data, error } = await supabase
        .from("participants")
        .insert(row as never)
        .select("id")
        .single();

      if (error) {
        if (error.code === "23505") {
          failed++;
          results.push({ index: i, status: "failed", personal_id: p.personal_id, error: { code: "duplicate", detail: "Participant already exists" } });
        } else {
          failed++;
          results.push({ index: i, status: "failed", personal_id: p.personal_id, error: { code: "db_error", detail: error.message } });
        }
      } else {
        created++;
        results.push({ index: i, status: "created", id: (data as unknown as { id: string }).id, personal_id: p.personal_id });
      }
    }
  }

  return NextResponse.json({ created, updated, failed, results }, { status: 207 });
}
