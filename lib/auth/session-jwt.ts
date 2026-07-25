import { SignJWT, jwtVerify } from "jose";

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_JWT_SECRET || "dev-secret-change-me-in-production"
);

export interface SessionPayload {
  sub: string; // session_id
  aud: string; // 'play'
  org_id: string;
  participant_id: string;
  quiz_version_id: string;
}

export async function signSessionJwt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(SESSION_SECRET);
}

export async function verifySessionJwt(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET, {
      audience: "play",
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
