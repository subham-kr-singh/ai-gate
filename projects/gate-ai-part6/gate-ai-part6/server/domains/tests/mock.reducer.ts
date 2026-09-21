import { clampSpentMs } from './mock.timer';
import type { MockEventInput, RawAnswer } from './mock.types';

/** Materialised per-question state, derived from the append-only event log. */
export interface AnswerStateRecord {
  questionId: string;
  selected: RawAnswer;
  firstAnswer: RawAnswer;
  markedForReview: boolean;
  guessed: boolean;
  visitCount: number;
  spentMs: number;
  lastSeq: number;
}

export function emptyState(questionId: string): AnswerStateRecord {
  return {
    questionId,
    selected: null,
    firstAnswer: null,
    markedForReview: false,
    guessed: false,
    visitCount: 0,
    spentMs: 0,
    lastSeq: 0,
  };
}

/** "" / [] / whitespace → null; MSQ arrays are de-duplicated and sorted so comparison is stable. */
export function normalizeAnswer(v: RawAnswer | undefined): RawAnswer {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) {
    const arr = [...new Set(v.map((x) => x.trim()).filter(Boolean))].sort();
    return arr.length ? arr : null;
  }
  const s = v.trim();
  return s === '' ? null : s;
}

export function answersEqual(a: RawAnswer, b: RawAnswer): boolean {
  const x = normalizeAnswer(a);
  const y = normalizeAnswer(b);
  if (x === null || y === null) return x === y;
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => v === y[i]);
  if (typeof x === 'string' && typeof y === 'string') return x === y;
  return false;
}

export function isAnswered(v: RawAnswer | undefined): boolean {
  return normalizeAnswer(v) !== null;
}

/**
 * Apply one event. Returns the next state and whether the event took effect.
 * Seq guard: an event whose seq is not newer than the state's lastSeq is stale
 * (a delayed retry) and must never overwrite newer data — it is only logged.
 */
export function reduceEvent(
  state: AnswerStateRecord,
  ev: MockEventInput,
): { state: AnswerStateRecord; applied: boolean } {
  if (ev.seq <= state.lastSeq) return { state, applied: false };
  const next: AnswerStateRecord = { ...state, lastSeq: ev.seq };

  switch (ev.kind) {
    case 'SELECT':
      next.selected = normalizeAnswer(ev.selected);
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
      next.visitCount += 1;
      break;
    case 'LEAVE':
      next.spentMs += clampSpentMs(ev.spentMs);
      if (next.firstAnswer === null && next.selected !== null) next.firstAnswer = next.selected;
      break;
    case 'TIME':
      next.spentMs += clampSpentMs(ev.spentMs);
      break;
  }
  return { state: next, applied: true };
}
