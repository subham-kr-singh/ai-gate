import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getEnv } from "@/lib/env";

const COOKIE_NAME = "gate_ai_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sign(value: string): string {
  const secret = getEnv().AUTH_SECRET;
  const hmac = crypto.createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${hmac}`;
}

function verify(signed: string): string | null {
  const secret = getEnv().AUTH_SECRET;
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", secret).update(value).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

/** Sets a signed, httpOnly session cookie carrying just the user's email.
 * Single-user system — no session table needed; the allowlist is the
 * authorization check on every request. */
export function createSession(email: string) {
  const token = sign(email.trim().toLowerCase());
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function destroySession() {
  cookies().delete(COOKIE_NAME);
}

/** Returns the logged-in email, or null if there is no valid session.
 * Does NOT re-check the allowlist — call isEmailAllowed() too if the
 * allowlist may have changed since the cookie was issued. */
export function getSessionEmail(): string | null {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return verify(raw);
}

export async function getCurrentUser() { const email = getSessionEmail(); return email ? { email, id: email, name: email.split("@")[0] } : null; }
