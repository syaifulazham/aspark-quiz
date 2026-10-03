"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mintSessionToken, isUniqueViolation } from "@/lib/auth/session-token";

const FALLBACK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_LIFETIME_MS = 60 * 60 * 1000;

async function getCaller() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  return (profile as unknown as { org_id: string; role: string } | null) ?? null;
}

/**
 * Issue a fresh login code for one participant + quiz within a competition session.
 * Any other unused, unrevoked codes for that participant + quiz + session are revoked,
 * so exactly one code is valid afterwards. The new code lasts until the session closes.
 */
export async function regenerateParticipantToken(input: {
  competitionSessionId: string;
  quizVersionId: string;
  participantId: string;
}) {
  const caller = await getCaller();
  if (!caller) return { error: "Unauthorized" };
  if (caller.role !== "owner" && caller.role !== "admin") {
    return { error: "Only owners and admins can generate tokens" };
  }

  const admin = createAdminClient();

  const [{ data: session }, { data: participant }, { data: quizSet }] = await Promise.all([
    admin
      .from("competition_sessions")
      .select("id, slug, closes_at")
      .eq("id", input.competitionSessionId)
      .eq("org_id", caller.org_id)
      .maybeSingle(),
    admin
      .from("participants")
      .select("id, personal_id, full_name")
      .eq("id", input.participantId)
      .eq("org_id", caller.org_id)
      .maybeSingle(),
    admin
      .from("session_quiz_sets")
      .select("id")
      .eq("competition_session_id", input.competitionSessionId)
      .eq("quiz_version_id", input.quizVersionId)
      .maybeSingle(),
  ]);

  const s = session as unknown as { id: string; slug: string; closes_at: string | null } | null;
  const p = participant as unknown as { id: string; personal_id: string; full_name: string } | null;
  if (!s) return { error: "Session not found" };
  if (!p) return { error: "Participant not found" };
  if (!quizSet) return { error: "This quiz is not part of the session" };

  const now = Date.now();
  const closesAt = s.closes_at ? new Date(s.closes_at).getTime() : null;
  if (closesAt !== null && closesAt <= now) {
    return { error: "This session has already closed. Extend its closing time first." };
  }
  const expiresAt = new Date(
    Math.max(closesAt ?? now + FALLBACK_LIFETIME_MS, now + MIN_LIFETIME_MS)
  ).toISOString();

  let raw = "";
  let tokenId: string | null = null;
  let lastError: { message: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const minted = mintSessionToken();
    raw = minted.raw;
    const { data, error } = await admin
      .from("session_tokens")
      .insert({
        org_id: caller.org_id,
        participant_id: p.id,
        quiz_version_id: input.quizVersionId,
        competition_session_id: s.id,
        token_hash: minted.hash,
        token_prefix: minted.prefix,
        mode: "solo",
        expires_at: expiresAt,
      } as never)
      .select("id")
      .single();
    lastError = error;
    if (!error) {
      tokenId = (data as unknown as { id: string }).id;
      break;
    }
    if (!isUniqueViolation(error)) break;
  }
  if (!tokenId) return { error: lastError?.message ?? "Could not generate a token" };

  // Only after the new code exists: retire the participant's other unused codes for this quiz
  const { error: revokeError } = await admin
    .from("session_tokens")
    .update({ revoked_at: new Date().toISOString() } as never)
    .eq("org_id", caller.org_id)
    .eq("participant_id", p.id)
    .eq("quiz_version_id", input.quizVersionId)
    .eq("competition_session_id", s.id)
    .neq("id", tokenId)
    .is("redeemed_at", null)
    .is("revoked_at", null);
  if (revokeError) return { error: `New code created, but old codes could not be revoked: ${revokeError.message}` };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";

  revalidatePath("/admin/live");
  return {
    success: true as const,
    token: raw,
    tokenId,
    expiresAt,
    participant: { fullName: p.full_name, personalId: p.personal_id },
    startUrl: `${proto}://${host}/quiz/${s.slug}/${input.quizVersionId}?token=${raw}`,
  };
}
