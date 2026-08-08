import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { formId } = await params;
  const body = await request.json();

  const supabase = createAdminClient();

  // Fetch form config
  const { data: form } = await supabase
    .from("registration_forms")
    .select("id, org_id, is_active, require_passcode, passcode, fields, quiz_id, competition_session_id, max_registrations, closes_at")
    .eq("id", formId)
    .eq("is_active", true)
    .single();

  if (!form) {
    return NextResponse.json({ error: "Form not found or inactive" }, { status: 404 });
  }

  const row = form as unknown as {
    id: string;
    org_id: string;
    is_active: boolean;
    require_passcode: boolean;
    passcode: string | null;
    fields: string[];
    quiz_id: string | null;
    competition_session_id: string | null;
    max_registrations: number | null;
    closes_at: string | null;
  };

  // Check if closed
  if (row.closes_at && new Date(row.closes_at) < new Date()) {
    return NextResponse.json({ error: "Registration is closed" }, { status: 403 });
  }

  // Verify passcode if required
  if (row.require_passcode) {
    if (!body.passcode || body.passcode !== row.passcode) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 403 });
    }
  }

  // Validate required fields
  if (!body.personal_id || !body.full_name) {
    return NextResponse.json(
      { error: "personal_id and full_name are required" },
      { status: 400 }
    );
  }

  // Check max registrations
  if (row.max_registrations) {
    const { count } = await supabase
      .from("participants")
      .select("*", { count: "exact", head: true })
      .eq("org_id", row.org_id)
      .eq("metadata->>registration_form_id", row.id);

    if (count && count >= row.max_registrations) {
      return NextResponse.json({ error: "Registration is full" }, { status: 403 });
    }
  }

  // Build participant row from allowed fields only
  const participant: Record<string, unknown> = {
    org_id: row.org_id,
    personal_id: body.personal_id,
    full_name: body.full_name,
    metadata: { registration_form_id: row.id },
    competition_session_id: row.competition_session_id || undefined,
  };

  const optionalFields = ["email", "phone", "grade", "school", "agency", "nationality", "date_of_birth", "gender"];
  for (const field of optionalFields) {
    if (row.fields.includes(field) && body[field]) {
      participant[field] = body[field];
    }
  }

  // Upsert participant
  const { data: savedParticipant, error: insertError } = await supabase
    .from("participants")
    .upsert(participant as never, { onConflict: "org_id,personal_id" })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    participant_id: (savedParticipant as unknown as { id: string }).id,
  });
}
