import { getCurrentUser, getSessionEmail } from "./session";
import { isEmailAllowed } from "./allowlist";

export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated.");
    this.name = "UnauthorizedError";
  }
}

/** Resolves the current session to a User row, creating it on first
 * sign-in. Re-checks the allowlist on every call (not just at login) so
 * revoking an email takes effect immediately, not just on next login. */
export async function requireUser() {
  const email = getSessionEmail();
  if (!email || !isEmailAllowed(email)) {
    throw new UnauthorizedError();
  }
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
