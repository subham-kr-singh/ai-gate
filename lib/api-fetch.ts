/**
 * Small client-side fetch helper.
 *
 * Every mutating call site needs the same two guarantees, and a raw `fetch`
 * gives neither:
 *
 *  1. **The spinner always stops.** A dropped connection or a DNS failure makes
 *     `fetch` reject rather than resolve with `!ok`, so a call site that only
 *     checks `res.ok` leaves its button disabled on "Saving…" forever. Here a
 *     rejection is turned into the same `{ ok: false, status: 0 }` result a
 *     server error produces, so there is exactly one failure path to handle.
 *  2. **The message is the server's, not the network's.** A non-2xx body is
 *     parsed for `{ error }` so the user sees why the request was refused
 *     rather than a generic string. A body that is not JSON (an HTML error
 *     page, an empty 502) falls back to the caller's wording.
 *
 * Returns the parsed body on success so callers do not each re-read the
 * stream; `body` is `undefined` when the response had no content.
 */

export interface ApiResult<T> {
  ok: boolean;
  /** HTTP status, or 0 when the request never reached the server. */
  status: number;
  body: T | undefined;
  /** Human-readable failure message, present only when `ok` is false. */
  error?: string;
}

export async function apiFetch<T = unknown>(
  url: string,
  init: RequestInit = {},
  fallbackError = "Something went wrong. Check your connection and try again."
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // Offline, DNS failure, or the request was aborted. Reported like a 0-status
    // server error so the caller's single failure branch runs.
    return { ok: false, status: 0, body: undefined, error: fallbackError };
  }

  // 204 and friends have no body to parse; treat them as a bare success.
  if (res.status === 204) return { ok: true, status: 204, body: undefined };

  let body: T | undefined;
  try {
    body = (await res.json()) as T;
  } catch {
    body = undefined;
  }

  if (!res.ok) {
    const maybeError = (body as { error?: unknown } | undefined)?.error;
    return {
      ok: false,
      status: res.status,
      body,
      error: typeof maybeError === "string" ? maybeError : fallbackError,
    };
  }

  return { ok: true, status: res.status, body };
}
