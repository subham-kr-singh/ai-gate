"use client";

import { useEffect, useState } from "react";

function formatMs(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** For mocks, pass deadlineAt (server-authoritative — architecture "Mock
 * Timer": remaining = deadlineAt - currentTime, never a bare setInterval
 * that assumes it survived phone lock/backgrounding). For topic quizzes,
 * omit deadlineAt and it counts up from mount instead. */
export function Timer({
  deadlineAt,
  onExpire,
}: {
  deadlineAt?: Date | string | null;
  onExpire?: () => void;
}) {
  const deadlineMs = deadlineAt ? new Date(deadlineAt).getTime() : null;

  // Ticks are 1s apart, so the first value can be taken from the current
  // second. Null until mounted: a clock rendered on the server would disagree
  // with the client's by the length of the request, which React reports as a
  // hydration mismatch and resolves by throwing the whole subtree away.
  const [now, setNow] = useState<number | null>(null);
  const [mountedAt, setMountedAt] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    // Anchored to the first whole second, so every later tick lands on a
    // second boundary instead of drifting with the interval.
    const anchor = Math.floor(Date.now() / 1000) * 1000;
    setMountedAt(anchor);
    setNow(anchor);
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (deadlineMs && now !== null && now >= deadlineMs && !expired) {
      setExpired(true);
      onExpire?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, deadlineMs, expired]);

  const display =
    now === null || mountedAt === null
      ? // Same width as a real value, so the number does not jump on mount.
        "--:--"
      : deadlineMs
      ? formatMs(deadlineMs - now)
      : formatMs(now - mountedAt);

  return (
    <div className="font-medium text-sm text-ink tabular-nums" aria-live="polite">
      {display}
    </div>
  );
}
