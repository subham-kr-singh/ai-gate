import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getEnv } from "@/lib/env";
import { db } from "@/server/db/client";

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

export interface SessionUser {
  /** The User row id — this is what every userId column references. */
  id: string;
  email: string;
  name: string;
}

/** Resolves the session cookie to a real User row, creating it on first
 * sign-in. Every caller that writes a userId (planner, DPP, mastery, mocks)
 * needs the row id, not the email — passing the email violated
 * `*_userId_fkey` on a fresh database. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const email = getSessionEmail();
  if (!email) return null;
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });
  return { id: user.id, email: user.email, name: user.name ?? user.email.split("@")[0]! };
}

/** The signed-in user's row id. Throws so callers can map it to a 401. */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user.id;
}
