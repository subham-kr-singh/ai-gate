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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const [mountedAt] = useState(() => Date.now());
  const [expired, setExpired] = useState(false);
  const deadlineMs = deadlineAt ? new Date(deadlineAt).getTime() : null;

  useEffect(() => {
    if (deadlineMs && now >= deadlineMs && !expired) {
      setExpired(true);
      onExpire?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, deadlineMs, expired]);

  const display = deadlineMs ? formatMs(deadlineMs - now) : formatMs(now - mountedAt);

  return (
    <div className="font-medium text-sm text-ink tabular-nums" aria-live="polite">
      {display}
    </div>
  );
}
