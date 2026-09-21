'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { estimateClockOffset } from '@/server/domains/tests/mock.timer';
import type {
  AutosaveAck,
  ClientAnswerState,
  MockEventInput,
  MockSessionSnapshot,
  RawAnswer,
} from '@/server/domains/tests/mock.types';

/**
 * Everything that makes a mock survive a locked phone, a refresh or a flaky network.
 *
 *  • Clock: the server owns `deadlineAt`. We keep only an OFFSET (serverNow ≈ Date.now() +
 *    offset), recalibrated on every response. No countdown state is ever stored.
 *  • Autosave: every change becomes an event with a monotonically increasing `seq`. Events
 *    go through a small outbox, one request in flight, retried with backoff. The server
 *    ignores duplicates and never lets an older seq overwrite a newer answer.
 *  • The outbox is mirrored to localStorage so a refresh with unsent events loses nothing.
 *    (Not offline-first: Dexie sync stays deferred per the V1 architecture.)
 *  • Dwell time is measured only while the tab is visible.
 */

export type SaveState = 'saved' | 'saving' | 'offline' | 'error';
export type Phase = 'running' | 'expired' | 'submitting' | 'submitError' | 'done';

const BATCH = 50;
const HEARTBEAT_MS = 45_000;
const NAT_DEBOUNCE_MS = 600;
const backoff = (n: number) => Math.min(15_000, 1_000 * 2 ** Math.min(n, 4));
const isBlank = (v: RawAnswer) => v === null || (Array.isArray(v) ? v.length === 0 : v.trim() === '');

class FatalError extends Error {}

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    return ((await res.json()) as { error?: { code?: string } })?.error?.code;
  } catch {
    return undefined;
  }
}

/** The subset of event semantics the browser needs for optimistic UI. */
function applyLocal(
  prev: Record<string, ClientAnswerState>,
  ev: MockEventInput,
): Record<string, ClientAnswerState> {
  const cur = prev[ev.questionId];
  if (!cur) return prev;
  const next = { ...cur };
  switch (ev.kind) {
    case 'SELECT':
      next.selected = isBlank(ev.selected ?? null) ? null : (ev.selected as RawAnswer);
      break;
    case 'CLEAR':
      next.selected = null;
      break;
    case 'MARK':
      next.markedForReview = true;
      break;
    case 'UNMARK':
      next.markedForReview = false;
      break;
    case 'GUESS':
      next.guessed = true;
      break;
    case 'UNGUESS':
      next.guessed = false;
      break;
    case 'VISIT':
      next.visited = true;
      break;
    default:
      return prev;
  }
  return { ...prev, [ev.questionId]: next };
}

export function useMockSession(snap: MockSessionSnapshot) {
  const router = useRouter();
  const id = snap.id;
  const outboxKey = `gateai:mock:${id}:outbox`;
  const deadlineAtMs = snap.deadlineAtMs ?? 0;
  const qids = useMemo(() => snap.questions.map((q) => q.id), [snap.questions]);

  const [answers, setAnswersState] = useState(snap.answers);
  const [index, setIndexState] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [pending, setPending] = useState(0);
  const [phase, setPhaseState] = useState<Phase>('running');

  const answersRef = useRef(snap.answers);
  const indexRef = useRef(0);
  const phaseRef = useRef<Phase>('running');
  const seq = useRef(snap.lastSeq);
  const outbox = useRef<MockEventInput[]>([]);
  const offset = useRef(snap.serverNowMs - Date.now());
  const calibrated = useRef(false);
  const inflight = useRef(false);
  const failures = useRef(0);
  const submitting = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const dwell = useRef<{ qid: string; banked: number; since: number | null }>({
    qid: qids[0] ?? '',
    banked: 0,
    since: Date.now(),
  });
  const natTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const natLatest = useRef(new Map<string, RawAnswer>());
  const booted = useRef(false);
  const wake = useRef<WakeLockSentinel | null>(null);

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  const updateAnswers = useCallback(
    (fn: (p: Record<string, ClientAnswerState>) => Record<string, ClientAnswerState>) => {
      answersRef.current = fn(answersRef.current);
      setAnswersState(answersRef.current);
    },
    [],
  );

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const persist = useCallback(() => {
    try {
      localStorage.setItem(outboxKey, JSON.stringify(outbox.current));
    } catch {
      /* private mode / quota: the in-memory outbox still works */
    }
  }, [outboxKey]);

  const goDone = useCallback(() => {
    setPhase('done');
    try {
      localStorage.removeItem(outboxKey);
    } catch {}
    router.replace(`/mocks/${id}/result`);
  }, [id, outboxKey, router, setPhase]);

  const post = useCallback(
    async (path: 'answer' | 'submit', body: unknown, keepalive = false) => {
      const sent = Date.now();
      const res = await fetch(`/api/mocks/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive,
      });
      return { res, sent, received: Date.now() };
    },
    [id],
  );

  const calibrate = useCallback((ack: AutosaveAck, sent: number, received: number) => {
    const { offsetMs, rttMs } = estimateClockOffset({
      serverNowMs: ack.serverNowMs,
      requestSentMs: sent,
      responseReceivedMs: received,
    });
    if (!calibrated.current || rttMs <= 3_000) {
      offset.current = offsetMs;
      calibrated.current = true;
    }
  }, []);

  const schedule = useCallback((ms: number) => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => void flushRef.current(), ms);
  }, []);

  const flush = useCallback(async () => {
    if (inflight.current || submitting.current) return;
    if (outbox.current.length === 0) {
      setSaveState('saved');
      return;
    }
    inflight.current = true;
    setSaveState('saving');
    const batch = outbox.current.slice(0, BATCH);
    const lastSeq = batch[batch.length - 1]!.seq;
    const dropSent = () => {
      outbox.current = outbox.current.filter((e) => e.seq > lastSeq);
      persist();
      setPending(outbox.current.length);
    };
    try {
      const { res, sent, received } = await post('answer', { events: batch }, true);
      if (res.ok) {
        const ack = (await res.json()) as AutosaveAck;
        calibrate(ack, sent, received);
        dropSent();
        failures.current = 0;
        if (ack.status === 'SUBMITTED') return goDone();
        if (outbox.current.length) {
          setSaveState('saving');
          schedule(0);
        } else setSaveState('saved');
      } else {
        if ((await errorCode(res)) === 'MOCK_SUBMITTED') return goDone();
        if (res.status >= 400 && res.status < 500) {
          dropSent(); // permanent rejection: retrying would loop forever
          setSaveState('error');
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      failures.current += 1;
      setSaveState(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
      schedule(backoff(failures.current));
    } finally {
      inflight.current = false;
    }
  }, [calibrate, goDone, persist, post, schedule]);
  flushRef.current = flush;

  const heartbeat = useCallback(async () => {
    if (inflight.current || submitting.current) return;
    try {
      const { res, sent, received } = await post('answer', { events: [] });
      if (!res.ok) {
        if ((await errorCode(res)) === 'MOCK_SUBMITTED') goDone();
        return;
      }
      const ack = (await res.json()) as AutosaveAck;
      calibrate(ack, sent, received);
      if (ack.status === 'SUBMITTED') goDone();
    } catch {
      /* the next autosave or heartbeat will try again */
    }
  }, [calibrate, goDone, post]);

  const canInteract = useCallback(
    () => phaseRef.current === 'running' && serverNow() < deadlineAtMs,
    [deadlineAtMs, serverNow],
  );

  const enqueue = useCallback(
    (p: Omit<MockEventInput, 'seq' | 'at'>) => {
      const ev: MockEventInput = { ...p, seq: ++seq.current, at: Math.round(serverNow()) };
      outbox.current.push(ev);
      persist();
      setPending(outbox.current.length);
      updateAnswers((prev) => applyLocal(prev, ev));
      schedule(250);
    },
    [persist, schedule, serverNow, updateAnswers],
  );

  const commitTime = useCallback(
    (kind: 'LEAVE' | 'TIME') => {
      const d = dwell.current;
      if (!d.qid) return;
      const now = Date.now();
      const spent = d.banked + (d.since !== null ? now - d.since : 0);
      d.banked = 0;
      if (d.since !== null) d.since = now;
      if (kind === 'LEAVE' || spent > 0) enqueue({ questionId: d.qid, kind, spentMs: Math.round(spent) });
    },
    [enqueue],
  );

  const flushNat = useCallback(() => {
    for (const [qid, t] of natTimers.current) {
      clearTimeout(t);
      const v = natLatest.current.get(qid) ?? null;
      enqueue(isBlank(v) ? { questionId: qid, kind: 'CLEAR' } : { questionId: qid, kind: 'SELECT', selected: v });
    }
    natTimers.current.clear();
    natLatest.current.clear();
  }, [enqueue]);

  // ── actions ────────────────────────────────────────────────────────────────

  const select = useCallback(
    (qid: string, value: RawAnswer, debounce = false) => {
      if (!canInteract()) return;
      updateAnswers((p) => (p[qid] ? { ...p, [qid]: { ...p[qid]!, selected: isBlank(value) ? null : value } } : p));
      if (debounce) {
        natLatest.current.set(qid, value);
        const old = natTimers.current.get(qid);
        if (old) clearTimeout(old);
        natTimers.current.set(
          qid,
          setTimeout(() => {
            natTimers.current.delete(qid);
            const v = natLatest.current.get(qid) ?? null;
            natLatest.current.delete(qid);
            enqueue(isBlank(v) ? { questionId: qid, kind: 'CLEAR' } : { questionId: qid, kind: 'SELECT', selected: v });
          }, NAT_DEBOUNCE_MS),
        );
      } else {
        enqueue(isBlank(value) ? { questionId: qid, kind: 'CLEAR' } : { questionId: qid, kind: 'SELECT', selected: value });
      }
    },
    [canInteract, enqueue, updateAnswers],
  );

  const clear = useCallback(
    (qid: string) => {
      if (!canInteract()) return;
      const t = natTimers.current.get(qid);
      if (t) clearTimeout(t);
      natTimers.current.delete(qid);
      natLatest.current.delete(qid);
      enqueue({ questionId: qid, kind: 'CLEAR' });
    },
    [canInteract, enqueue],
  );

  const toggleMark = useCallback(
    (qid: string) => {
      if (!canInteract()) return;
      enqueue({ questionId: qid, kind: answersRef.current[qid]?.markedForReview ? 'UNMARK' : 'MARK' });
    },
    [canInteract, enqueue],
  );

  const toggleGuess = useCallback(
    (qid: string) => {
      if (!canInteract()) return;
      enqueue({ questionId: qid, kind: answersRef.current[qid]?.guessed ? 'UNGUESS' : 'GUESS' });
    },
    [canInteract, enqueue],
  );

  const goTo = useCallback(
    (i: number) => {
      if (!canInteract() || i === indexRef.current || i < 0 || i >= qids.length) return;
      flushNat();
      commitTime('LEAVE');
      const qid = qids[i]!;
      dwell.current = { qid, banked: 0, since: document.visibilityState === 'visible' ? Date.now() : null };
      enqueue({ questionId: qid, kind: 'VISIT' });
      indexRef.current = i;
      setIndexState(i);
    },
    [canInteract, commitTime, enqueue, flushNat, qids],
  );

  const submit = useCallback(
    async (reason: 'USER' | 'TIMER') => {
      if (submitting.current) return;
      submitting.current = true;
      setPhase(reason === 'TIMER' ? 'expired' : 'submitting');
      flushNat();
      commitTime('LEAVE');
      if (retryTimer.current) clearTimeout(retryTimer.current);

      for (let attempt = 0; ; attempt++) {
        try {
          const { res } = await post('submit', { reason, events: outbox.current });
          if (res.ok) {
            outbox.current = [];
            return goDone();
          }
          if ((await errorCode(res)) === 'MOCK_SUBMITTED') return goDone();
          if (res.status >= 400 && res.status < 500) throw new FatalError();
        } catch (e) {
          // Timer expiry retries until it lands (the server also finalises on its own).
          if (e instanceof FatalError || (reason === 'USER' && attempt >= 2)) {
            submitting.current = false;
            setPhase('submitError');
            return;
          }
        }
        await new Promise((r) => setTimeout(r, backoff(attempt)));
      }
    },
    [commitTime, flushNat, goDone, post, setPhase],
  );

  // ── lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    try {
      const raw = localStorage.getItem(outboxKey);
      if (raw) {
        const fresh = (JSON.parse(raw) as MockEventInput[]).filter((e) => e.seq > snap.lastSeq);
        if (fresh.length) {
          outbox.current = fresh;
          seq.current = Math.max(seq.current, fresh[fresh.length - 1]!.seq);
          updateAnswers((p) => fresh.reduce(applyLocal, p));
          setPending(fresh.length);
          schedule(0);
        } else localStorage.removeItem(outboxKey);
      }
    } catch {}

    if (qids[0]) enqueue({ questionId: qids[0], kind: 'VISIT' });
    void heartbeat();
  }, [enqueue, heartbeat, outboxKey, qids, schedule, snap.lastSeq, updateAnswers]);

  useEffect(() => {
    const acquireWake = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          wake.current = await navigator.wakeLock.request('screen');
        }
      } catch {}
    };
    void acquireWake();

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        flushNat();
        commitTime('TIME');
        dwell.current.since = null;
        void flushRef.current();
      } else {
        dwell.current.since = Date.now();
        void heartbeat();
        void acquireWake();
      }
    };
    const onPageHide = () => {
      flushNat();
      commitTime('TIME');
      void flushRef.current();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        dwell.current.since = Date.now();
        void heartbeat();
      }
    };
    const onOnline = () => {
      failures.current = 0;
      schedule(0);
      void heartbeat();
    };
    const beat = setInterval(() => {
      if (document.visibilityState === 'visible') void heartbeat();
    }, HEARTBEAT_MS);

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(beat);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
      void wake.current?.release().catch(() => {});
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [commitTime, flushNat, heartbeat, schedule]);

  return {
    answers,
    index,
    phase,
    saveState,
    pending,
    serverNow,
    goTo,
    next: () => goTo(indexRef.current + 1),
    prev: () => goTo(indexRef.current - 1),
    select,
    clear,
    toggleMark,
    toggleGuess,
    submit,
  };
}
