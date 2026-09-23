'use client';

import { Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatHMS, minutesLeft } from '@/server/domains/tests/mock.timer';

/**
 * Server-clock timer. It stores NOTHING that counts down: every tick recomputes
 * remaining = deadlineAt − serverNow. The interval only repaints, so a throttled background
 * tab, a locked phone or a bfcache restore can never make it drift — the very next tick
 * (or the visibility/focus/pageshow event) shows the true value.
 */

const THRESHOLDS = [1, 5, 10, 30]; // minutes; ascending
const URGENT_MS = 10 * 60_000;

interface Props {
  deadlineAtMs: number;
  getServerNow: () => number;
  onExpire: () => void;
}

export function MockTimer({ deadlineAtMs, getServerNow, onExpire }: Props) {
  // null until mounted, so server and first client render match (no hydration mismatch)
  const [remaining, setRemaining] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const fired = useRef(false);
  const band = useRef<number | null>(null);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, deadlineAtMs - getServerNow());
      setRemaining(r);
      if (r <= 0) {
        if (!fired.current) {
          fired.current = true;
          expireRef.current();
        }
        return;
      }
      const m = minutesLeft(r);
      const b = THRESHOLDS.find((t) => m <= t) ?? null;
      if (b !== null && b !== band.current) {
        band.current = b;
        setAnnounce(`${m} ${m === 1 ? 'minute' : 'minutes'} left`);
      }
    };
    tick();
    const t = setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, [deadlineAtMs, getServerNow]);

  const urgent = remaining !== null && remaining <= URGENT_MS;

  return (
    <div>
      <div
        role="timer"
        aria-label="Time remaining"
        className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold tabular-nums text-ink ${
          urgent ? 'bg-amber' : 'bg-control'
        }`}
      >
        <Clock size={15} aria-hidden />
        <span>{remaining === null ? '-:--:--' : formatHMS(remaining)}</span>
        {urgent && <span className="text-xs font-medium">Last 10 min</span>}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
