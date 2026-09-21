import { describe, expect, it } from 'vitest';
import {
  EVENT_SKEW_MS,
  LATE_SYNC_WINDOW_MS,
  clampSpentMs,
  computeDeadline,
  estimateClockOffset,
  formatHMS,
  judgeEvent,
  minutesLeft,
  remainingMs,
  shouldServerFinalize,
} from '@/server/domains/tests/mock.timer';

describe('deadline math', () => {
  it('deadline = start + duration; remaining never goes negative', () => {
    const d = computeDeadline(1_000_000, 180 * 60);
    expect(d).toBe(1_000_000 + 10_800_000);
    expect(remainingMs(d, d - 5_000)).toBe(5_000);
    expect(remainingMs(d, d + 99_999)).toBe(0);
  });

  it('remaining is a pure function of absolute time: a phone that slept 40 min resumes correctly', () => {
    const start = 0;
    const d = computeDeadline(start, 180 * 60);
    const beforeLock = 30 * 60_000;
    const afterUnlock = beforeLock + 40 * 60_000;
    expect(remainingMs(d, beforeLock)).toBe(150 * 60_000);
    expect(remainingMs(d, afterUnlock)).toBe(110 * 60_000);
  });
});

describe('judgeEvent', () => {
  const deadline = 10_000_000;
  it('accepts events made before the deadline', () => {
    expect(judgeEvent({ deadlineAtMs: deadline, nowMs: deadline - 1000, eventAtMs: deadline - 1000 })).toBe('ACCEPT');
  });
  it('accepts an in-time event delivered late (flaky network at the buzzer)', () => {
    expect(judgeEvent({ deadlineAtMs: deadline, nowMs: deadline + 4 * 60_000, eventAtMs: deadline - 2000 })).toBe('ACCEPT');
  });
  it('rejects an event stamped after the deadline (beyond skew)', () => {
    const now = deadline + 30_000;
    expect(judgeEvent({ deadlineAtMs: deadline, nowMs: now, eventAtMs: deadline + EVENT_SKEW_MS + 1 })).toBe('REJECT_LATE');
  });
  it('clamps a claimed-future timestamp to server now', () => {
    const now = deadline + 60_000; // already past the deadline
    expect(judgeEvent({ deadlineAtMs: deadline, nowMs: now, eventAtMs: now + 999_999 })).toBe('REJECT_LATE');
  });
  it('rejects everything once the late-sync window has closed', () => {
    const now = deadline + LATE_SYNC_WINDOW_MS + 1;
    expect(judgeEvent({ deadlineAtMs: deadline, nowMs: now, eventAtMs: deadline - 10_000 })).toBe('REJECT_LATE');
  });
});

describe('server finalisation window', () => {
  it('only finalises after deadline + late-sync window', () => {
    const d = 5_000_000;
    expect(shouldServerFinalize(d, d + LATE_SYNC_WINDOW_MS)).toBe(false);
    expect(shouldServerFinalize(d, d + LATE_SYNC_WINDOW_MS + 1)).toBe(true);
  });
});

describe('client helpers', () => {
  it('estimates offset at the request midpoint', () => {
    // client clock is 5s behind the server; RTT 400ms
    const { offsetMs, rttMs } = estimateClockOffset({
      serverNowMs: 1_005_200,
      requestSentMs: 1_000_000,
      responseReceivedMs: 1_000_400,
    });
    expect(rttMs).toBe(400);
    expect(offsetMs).toBe(5_000);
  });
  it('formats H:MM:SS rounding up', () => {
    expect(formatHMS(10_800_000)).toBe('3:00:00');
    expect(formatHMS(65_000)).toBe('0:01:05');
    expect(formatHMS(1)).toBe('0:00:01');
    expect(formatHMS(0)).toBe('0:00:00');
    expect(formatHMS(-50)).toBe('0:00:00');
  });
  it('rounds minutes up for announcements', () => {
    expect(minutesLeft(60_001)).toBe(2);
    expect(minutesLeft(60_000)).toBe(1);
  });
  it('clamps reported dwell time', () => {
    expect(clampSpentMs(-5)).toBe(0);
    expect(clampSpentMs(NaN)).toBe(0);
    expect(clampSpentMs(10 ** 12)).toBe(60 * 60_000);
    expect(clampSpentMs(1234.6)).toBe(1235);
  });
});
