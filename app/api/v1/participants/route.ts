import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";
import { participantSchema } from "@/lib/schemas/participant";

export async function POST(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      {
        type: "https://docs.quizzly.app/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Missing, malformed, revoked or expired API key.",
      },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("participants:write")) {
    return NextResponse.json(
      {
        type: "https://docs.quizzly.app/errors/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "API key lacks participants:write scope.",
      },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = participantSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        type: "https://docs.quizzly.app/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "Request body failed schema validation.",
        errors: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          code: i.code,
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const upsert = request.nextUrl.searchParams.get("upsert") === "true";

  const { data, error } = await supabase
    .from("participants")
    .upsert(
      {
        org_id: ctx.orgId,
        ...parsed.data,
      } as never,
      {
        onConflict: "org_id,personal_id",
        ignoreDuplicates: !upsert,
      }
    )
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        {
          type: "https://docs.quizzly.app/errors/participant_exists",
          title: "Participant already exists",
          status: 409,
          detail: `A participant with personal_id '${parsed.data.personal_id}' already exists in this organisation.`,
          errors: [{ field: "personal_id", code: "duplicate" }],
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        type: "https://docs.quizzly.app/errors/internal",
        title: "Internal error",
        status: 500,
        detail: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: upsert ? 200 : 201 });
}

export async function GET(request: NextRequest) {
  const ctx = await verifyApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      {
        type: "https://docs.quizzly.app/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Missing, malformed, revoked or expired API key.",
      },
      { status: 401 }
    );
  }

  if (!ctx.scopes.includes("participants:read")) {
    return NextResponse.json(
      {
        type: "https://docs.quizzly.app/errors/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "API key lacks participants:read scope.",
      },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();
  const params = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(params.get("limit") || "50"), 200);
  const cursor = params.get("cursor");

  let query = supabase
    .from("participants")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const personalId = params.get("personal_id");
  if (personalId) query = query.ilike("personal_id", personalId);

  const school = params.get("school");
  if (school) query = query.ilike("school", `%${school}%`);

  const agency = params.get("agency");
  if (agency) query = query.ilike("agency", `%${agency}%`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { type: "https://docs.quizzly.app/errors/internal", title: "Internal error", status: 500, detail: error.message },
      { status: 500 }
    );
  }

  const rows = (data || []) as Array<Record<string, unknown>>;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    data: items,
    pagination: {
      next_cursor: hasMore ? (items[items.length - 1]?.created_at as string) : null,
      has_more: hasMore,
      limit,
    },
  });
}
