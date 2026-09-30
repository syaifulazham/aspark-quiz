export type TokenStatus = "active" | "not_yet_valid" | "redeemed" | "expired" | "revoked";

export interface TokenStatusInput {
  expires_at: string;
  not_before: string | null;
  redeemed_at: string | null;
  revoked_at: string | null;
}

/**
 * A token's lifecycle state.
 *
 * Order matters. Revocation and redemption are facts about what happened, so
 * they win over the clock: a token redeemed yesterday that has since passed
 * `expires_at` is still `redeemed`, not `expired`. Consequently `expired`
 * only ever describes a token that lapsed without being used — which is what
 * lets an integrator safely offer a replacement.
 */
export function deriveTokenStatus(t: TokenStatusInput, now: Date = new Date()): TokenStatus {
  if (t.revoked_at) return "revoked";
  if (t.redeemed_at) return "redeemed";
  if (new Date(t.expires_at) < now) return "expired";
  if (t.not_before && new Date(t.not_before) > now) return "not_yet_valid";
  return "active";
}

/**
 * Expired and never redeemed or revoked. Revoked is excluded on purpose: an
 * admin revoked it, and re-issuing would quietly undo that decision.
 */
export function isExpiredUnused(t: TokenStatusInput, now: Date = new Date()): boolean {
  return deriveTokenStatus(t, now) === "expired";
}
