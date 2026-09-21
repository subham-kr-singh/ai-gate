import { allowedEmails } from "@/lib/env";

/** Because this is a personal system, auth is a static email allowlist
 * (architecture "Login Allowlist") — no OAuth roles, no signup flow. */
export function isEmailAllowed(email: string): boolean {
  return allowedEmails().includes(email.trim().toLowerCase());
}
