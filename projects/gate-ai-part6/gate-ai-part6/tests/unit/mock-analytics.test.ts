import { describe, expect, it } from 'vitest';
import { computeMockAnalytics, type GradedItem } from '@/server/domains/tests/mock.analytics';
import { answersEqual, emptyState, normalizeAnswer, reduceEvent } from '@/server/domains/tests/mock.reducer';
import type { MockEventInput, PaperQuestion, QuestionType, RawAnswer } from '@/server/domains/tests/mock.types';

const ctx = {
  durationSec: 10_800,
  usedSec: 9_000,
  expectedSecPerMark: 108,
  sectionLabels: { GA: 'General Aptitude', CORE: 'Computer Science' } as const,
};

function q(id: string, over: Partial<PaperQuestion> = {}): PaperQuestion {
  return {
    id, type: 'MCQ', marks: 1, section: 'CORE', statement: '', options: null,
    subjectId: 'os', subjectName: 'Operating Systems', unitId: 'os-u1', unitName: 'Memory', topicId: 't1', topicName: 'Paging',
    year: null, source: null, ...over,
  };
}

function item(position: number, over: Partial<GradedItem> & { question?: PaperQuestion } = {}): GradedItem {
  return {
    position, question: over.question ?? q(`q${position}`), wasSeenBefore: false,
    finalAnswer: 'A', firstAnswer: 'A', attempted: true, correct: true, marks: 1,
    firstAttempted: true, firstCorrect: true, firstMarks: 1,
    markedForReview: false, guessed: false, spentMs: 60_000, ...over,
  };
}

describe('score, accuracy, attempt rate', () => {
  it('handles correct / wrong (negative) / unanswered', () => {
    const items = [
      item(1), // +1
      item(2, { question: q('q2', { marks: 2 }), marks: 2, firstMarks: 2 }), // +2
      item(3, { correct: false, marks: -1 / 3, firstCorrect: false, firstMarks: -1 / 3 }), // wrong 1-mark
      item(4, { question: q('q4', { marks: 2 }), correct: false, marks: -2 / 3, firstCorrect: false, firstMarks: -2 / 3 }),
      item(5, { attempted: false, correct: false, marks: 0, finalAnswer: null, firstAnswer: null, firstAttempted: false, firstCorrect: false, firstMarks: 0 }),
    ];
    const a = computeMockAnalytics(items, ctx);
    expect(a.counts).toEqual({ total: 5, attempted: 4, correct: 2, wrong: 2, unanswered: 1 });
    expect(a.score.max).toBe(1 + 2 + 1 + 2 + 1);
    expect(a.score.obtained).toBeCloseTo(3 - 1 / 3 - 2 / 3, 3);
    expect(a.score.negative).toBeCloseTo(1, 3);
    expect(a.score.gained).toBe(3);
    expect(a.accuracy).toBeCloseTo(0.5);
    expect(a.attemptRate).toBeCloseTo(0.8);
  });

  it('accuracy is null (not NaN) when nothing was attempted', () => {
    const a = computeMockAnalytics(
      [item(1, { attempted: false, correct: false, marks: 0, finalAnswer: null, firstAnswer: null, firstAttempted: false, firstCorrect: false, firstMarks: 0 })],
      ctx,
    );
    expect(a.accuracy).toBeNull();
    expect(a.guessing.guessRate).toBeNull();
    expect(a.reviewed.accuracy).toBeNull();
  });
});

describe('time', () => {
  it('time lost = dwell beyond the per-mark budget on questions that earned nothing', () => {
    const items = [
      item(1, { spentMs: 300_000 }), // correct, long — NOT lost
      item(2, { correct: false, marks: -1 / 3, firstCorrect: false, spentMs: 208_000 }), // 1-mark: 208-108 = 100s lost
      item(3, { question: q('q3', { marks: 2 }), attempted: false, correct: false, marks: 0, finalAnswer: null, firstAnswer: null, firstAttempted: false, firstCorrect: false, firstMarks: 0, spentMs: 116_000 }), // 2-mark: 116-216 → 0
    ];
    const a = computeMockAnalytics(items, ctx);
    expect(a.time.timeLostSec).toBe(100);
    expect(a.time.accountedSec).toBe(624);
    expect(a.time.unusedSec).toBe(1_800);
    expect(a.time.avgSecPerAttempted).toBeCloseTo((300 + 208) / 2);
  });
});

describe('did changing answers help?', () => {
  it('classifies wrong→right, right→wrong, wrong→wrong, cleared and nets the marks', () => {
    const items = [
      // wrong→right (+1 vs −1/3)
      item(1, { firstAnswer: 'B', finalAnswer: 'A', firstCorrect: false, firstMarks: -1 / 3, correct: true, marks: 1 }),
      // right→wrong
      item(2, { firstAnswer: 'A', finalAnswer: 'B', firstCorrect: true, firstMarks: 1, correct: false, marks: -1 / 3 }),
      // wrong→wrong
      item(3, { firstAnswer: 'B', finalAnswer: 'C', firstCorrect: false, firstMarks: -1 / 3, correct: false, marks: -1 / 3 }),
      // cleared to blank
      item(4, { firstAnswer: 'B', finalAnswer: null, firstCorrect: false, firstMarks: -1 / 3, attempted: false, correct: false, marks: 0 }),
      // unchanged & right
      item(5),
    ];
    const c = computeMockAnalytics(items, ctx).answerChanges;
    expect(c.changedCount).toBe(4);
    expect(c.wrongToRight).toBe(1);
    expect(c.rightToWrong).toBe(1);
    expect(c.wrongToWrong).toBe(1);
    expect(c.clearedToBlank).toBe(1);
    // (1+1/3) + (−1/3−1) + 0 + (0+1/3)
    expect(c.netMarks).toBeCloseTo(1 + 1 / 3 - 4 / 3 + 1 / 3, 3);
    expect(c.changedAccuracy).toBeCloseTo(1 / 3);
    expect(c.unchangedAccuracy).toBe(1);
    expect(c.firstAttemptAccuracy).toBeCloseTo(2 / 5);
  });

  it('reports zero changes cleanly', () => {
    const c = computeMockAnalytics([item(1), item(2)], ctx).answerChanges;
    expect(c.changedCount).toBe(0);
    expect(c.changedAccuracy).toBeNull();
    expect(c.netMarks).toBe(0);
  });
});

describe('guessing and review flags', () => {
  it('measures whether flagged guesses paid off after negative marking', () => {
    const items = [
      item(1, { guessed: true }), // +1
      item(2, { guessed: true, correct: false, marks: -1 / 3 }),
      item(3, { guessed: true, correct: false, marks: -1 / 3 }),
      item(4, { markedForReview: true }),
      item(5, { markedForReview: true, attempted: false, correct: false, marks: 0, finalAnswer: null }),
    ];
    const a = computeMockAnalytics(items, ctx);
    expect(a.guessing.guessedAttempted).toBe(3);
    expect(a.guessing.guessRate).toBeCloseTo(3 / 4);
    expect(a.guessing.guessAccuracy).toBeCloseTo(1 / 3);
    expect(a.guessing.netMarks).toBeCloseTo(1 - 2 / 3, 3);
    expect(a.reviewed).toMatchObject({ marked: 2, markedAttempted: 1, markedCorrect: 1, accuracy: 1 });
  });
});

describe('breakdowns', () => {
  it('groups by subject/unit/type/marks and lists the weakest first', () => {
    const dbms = { subjectId: 'db', subjectName: 'Databases', unitId: 'db-u1', unitName: 'SQL' };
    const items = [
      item(1), item(2),
      item(3, { question: q('q3', dbms), correct: false, marks: -1 / 3 }),
      item(4, { question: q('q4', { ...dbms, type: 'NAT' }), correct: false, marks: 0 }),
    ];
    const a = computeMockAnalytics(items, ctx);
    expect(a.bySubject.map((r) => r.label)).toEqual(['Databases', 'Operating Systems']);
    expect(a.bySubject[0]).toMatchObject({ total: 2, correct: 0, wrong: 2, negativeMarks: expect.closeTo(1 / 3, 3) });
    expect(a.byType.map((r) => r.key)).toEqual(['MCQ', 'NAT']);
    expect(a.byMarks.map((r) => r.label)).toEqual(['1-mark']);
    expect(a.bySection.map((r) => r.label)).toEqual(['Computer Science']);
    expect(a.perQuestion).toHaveLength(4);
    expect(a.perQuestion[2]!.outcome).toBe('WRONG');
  });
});

describe('event reducer', () => {
  const ev = (seq: number, kind: MockEventInput['kind'], extra: Partial<MockEventInput> = {}): MockEventInput => ({
    seq, kind, questionId: 'q1', at: 0, ...extra,
  });

  it('applies select → mark → guess → leave and captures the first answer on LEAVE', () => {
    let s = emptyState('q1');
    for (const e of [ev(1, 'VISIT'), ev(2, 'SELECT', { selected: 'B' }), ev(3, 'MARK'), ev(4, 'GUESS'), ev(5, 'SELECT', { selected: 'C' })]) {
      s = reduceEvent(s, e).state;
    }
    expect(s).toMatchObject({ selected: 'C', markedForReview: true, guessed: true, visitCount: 1, firstAnswer: null });
    s = reduceEvent(s, ev(6, 'LEAVE', { spentMs: 42_000 })).state;
    expect(s.firstAnswer).toBe('C'); // committed answer on leaving, not the first click
    expect(s.spentMs).toBe(42_000);
    s = reduceEvent(s, ev(7, 'SELECT', { selected: 'D' })).state;
    expect(s.firstAnswer).toBe('C'); // never rewritten
    expect(s.selected).toBe('D');
  });

  it('TIME banks dwell without committing the first answer', () => {
    let s = emptyState('q1');
    s = reduceEvent(s, ev(1, 'SELECT', { selected: 'A' })).state;
    s = reduceEvent(s, ev(2, 'TIME', { spentMs: 5_000 })).state;
    expect(s.firstAnswer).toBeNull();
    expect(s.spentMs).toBe(5_000);
  });

  it('a stale (older-seq) event never overwrites newer data', () => {
    let s = emptyState('q1');
    s = reduceEvent(s, ev(10, 'SELECT', { selected: 'C' })).state;
    const r = reduceEvent(s, ev(7, 'SELECT', { selected: 'A' }));
    expect(r.applied).toBe(false);
    expect(r.state.selected).toBe('C');
  });

  it('normalises answers so comparison is stable', () => {
    expect(normalizeAnswer('  ')).toBeNull();
    expect(normalizeAnswer([])).toBeNull();
    expect(normalizeAnswer(['C', 'A', 'A'])).toEqual(['A', 'C']);
    expect(answersEqual(['C', 'A'], ['A', 'C'])).toBe(true);
    expect(answersEqual('A', ['A'] as RawAnswer)).toBe(false);
    expect(answersEqual(null, null)).toBe(true);
  });
});

// keep the QuestionType import used for documentation of intent
const _t: QuestionType = 'MCQ';
void _t;
