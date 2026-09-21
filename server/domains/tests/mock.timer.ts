/**
 * Clock rules for the mock simulator. Pure and dependency-free so the SERVER and the
 * BROWSER apply exactly the same arithmetic.
 *
 * The one rule: remaining = deadlineAt − serverNow. No setInterval "countdown" state
 * exists anywhere; intervals only repaint a value recomputed from absolute time, so
 * phone lock, tab throttling and bfcache restores cannot drift the clock.
 */

/** Events stamped at or before deadline + this are still honoured (network jitter). */
export const EVENT_SKEW_MS = 5_000;

/**
 * After the deadline, answers made IN TIME may still be delivered for this long
 * (flaky mobile network at the buzzer). After it, the server finalises the mock itself.
 */
export const LATE_SYNC_WINDOW_MS = 10 * 60_000;

/** Upper bound for one event's reported dwell time. */
export const MAX_EVENT_SPENT_MS = 60 * 60_000;

export function computeDeadline(startedAtMs: number, durationSec: number): number {
  return startedAtMs + durationSec * 1000;
}

export function remainingMs(deadlineAtMs: number, nowMs: number): number {
  return Math.max(0, deadlineAtMs - nowMs);
}

export function isExpired(deadlineAtMs: number, nowMs: number): boolean {
  return nowMs >= deadlineAtMs;
}

export type EventVerdict = 'ACCEPT' | 'REJECT_LATE';

/**
 * Decide whether an autosave event still counts.
 * `eventAtMs` is the client's estimate of server time when the student acted. We clamp it to
 * `nowMs` so a client cannot claim to have acted "in the future". This is a personal tool:
 * the timestamp is trusted only as far as the student is trusted.
 */
export function judgeEvent(args: {
  deadlineAtMs: number;
  nowMs: number;
  eventAtMs: number;
}): EventVerdict {
  const { deadlineAtMs, nowMs, eventAtMs } = args;
  if (nowMs > deadlineAtMs + LATE_SYNC_WINDOW_MS) return 'REJECT_LATE';
  const effectiveAt = Math.min(eventAtMs, nowMs);
  return effectiveAt <= deadlineAtMs + EVENT_SKEW_MS ? 'ACCEPT' : 'REJECT_LATE';
}

/** True once nobody can legitimately deliver more answers, so the server may finalise. */
export function shouldServerFinalize(deadlineAtMs: number, nowMs: number): boolean {
  return nowMs > deadlineAtMs + LATE_SYNC_WINDOW_MS;
}

export function clampSpentMs(v: number | undefined): number {
  if (!v || !Number.isFinite(v) || v < 0) return 0;
  return Math.min(Math.round(v), MAX_EVENT_SPENT_MS);
}

// ── client-side helpers (pure, so they are unit-tested here) ─────────────────

/**
 * Offset such that serverNow ≈ Date.now() + offset. Uses the request midpoint so one-way
 * latency cancels out to first order.
 */
export function estimateClockOffset(args: {
  serverNowMs: number;
  requestSentMs: number;
  responseReceivedMs: number;
}): { offsetMs: number; rttMs: number } {
  const rttMs = Math.max(0, args.responseReceivedMs - args.requestSentMs);
  const midpoint = args.requestSentMs + rttMs / 2;
  return { offsetMs: args.serverNowMs - midpoint, rttMs };
}

/** 10800000 → "3:00:00" · 65000 → "0:01:05" (rounds UP so 0:00:00 means truly out of time). */
export function formatHMS(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Whole minutes remaining, rounded up — used for threshold announcements. */
export function minutesLeft(ms: number): number {
  return Math.ceil(Math.max(0, ms) / 60_000);
}
