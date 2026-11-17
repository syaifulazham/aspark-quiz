import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const SECRET = process.env.SESSION_JWT_SECRET || "dev-secret-change-me-in-production";
const KEY_LEN = 32;

/** Cookie that remembers a visitor unlocked one scoreboard. */
export const accessCookieName = (boardId: string) => `qz_sb_${boardId.replace(/-/g, "").slice(0, 16)}`;
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function hashPasscode(passcode: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(passcode, salt, KEY_LEN);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPasscode(passcode: string, stored: string) {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scrypt(passcode, Buffer.from(saltB64, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Value stored in the access cookie. It is bound to the current passcode hash,
 * so changing or removing the passcode signs every existing visitor out.
 */
export function accessToken(boardId: string, passcodeHash: string) {
  return createHmac("sha256", SECRET).update(`${boardId}:${passcodeHash}`).digest("base64url");
}

export function hasAccess(boardId: string, passcodeHash: string | null, cookieValue: string | undefined) {
  if (!passcodeHash) return true;
  if (!cookieValue) return false;
  const expected = Buffer.from(accessToken(boardId, passcodeHash));
  const actual = Buffer.from(cookieValue);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
