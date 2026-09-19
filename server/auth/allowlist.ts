import { env } from "@/lib/env";

/**
 * This is a personal, single-user system (see architecture doc §"Login
 * Allowlist") — no signup flow, no roles. Only emails explicitly listed
 * in ALLOWED_EMAILS can create a session.
 */
export function isEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return env.allowedEmails.includes(normalized);
}
