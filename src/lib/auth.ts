import { SignJWT, jwtVerify } from "jose";

// Single shared-password auth. A signed, httpOnly cookie marks an "editor"
// session. Edge-safe (jose + Web Crypto) so it can run in middleware.

export const SESSION_COOKIE = "sigma_session";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(
    process.env.AUTH_COOKIE_SECRET || "dev-insecure-secret-change-me",
  );
}

export function editPassword(): string {
  return process.env.EDIT_PASSWORD || "sigma";
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "editor" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifySessionToken(token?: string): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}
