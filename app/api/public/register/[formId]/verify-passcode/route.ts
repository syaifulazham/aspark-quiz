import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { formId } = await params;
  const { passcode } = await request.json();

  if (!passcode) {
    return NextResponse.json({ error: "Passcode required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: form } = await supabase
    .from("registration_forms")
    .select("passcode, require_passcode")
    .eq("id", formId)
    .eq("is_active", true)
    .single();

  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const row = form as unknown as { passcode: string | null; require_passcode: boolean };

  if (!row.require_passcode) {
    return NextResponse.json({ ok: true });
  }

  if (row.passcode !== passcode) {
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
