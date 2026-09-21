import { answersEqual } from './mock.reducer';
import type {
  GroupRow,
  MockAnalytics,
  Outcome,
  PaperQuestion,
  PerQuestionRow,
  QuestionType,
  RawAnswer,
  SectionKey,
} from './mock.types';

/**
 * Mock analytics (architecture §66). Pure: graded items in, numbers out. Everything the
 * result page shows comes from here, and the snapshot is stored so old results never change
 * when the algorithm does (`ANALYTICS_VERSION`).
 *
 * Deliberately absent: rank, percentile, "predicted score". The system reports evidence,
 * not exam outcomes (architecture §33).
 */

export const ANALYTICS_VERSION = 'v1';

export interface GradedItem {
  position: number;
  question: PaperQuestion;
  wasSeenBefore: boolean;
  finalAnswer: RawAnswer;
  /** Answer committed the first time the student left the question. */
  firstAnswer: RawAnswer;
  attempted: boolean;
  correct: boolean;
  /** Marks obtained; negative for a wrong MCQ. */
  marks: number;
  firstAttempted: boolean;
  firstCorrect: boolean;
  firstMarks: number;
  markedForReview: boolean;
  guessed: boolean;
  spentMs: number;
}

export interface AnalyticsContext {
  durationSec: number;
  /** Seconds between start and min(submit, deadline). */
  usedSec: number;
  expectedSecPerMark: number;
  sectionLabels: Record<SectionKey, string>;
}

const TYPE_LABEL: Record<QuestionType, string> = {
  MCQ: 'Multiple choice',
  MSQ: 'Multiple select',
  NAT: 'Numerical answer',
};

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function outcomeOf(i: GradedItem): Outcome {
  if (!i.attempted) return 'UNANSWERED';
  return i.correct ? 'CORRECT' : 'WRONG';
}

function toRow(key: string, label: string, items: GradedItem[]): GroupRow {
  const attempted = items.filter((i) => i.attempted);
  const correct = attempted.filter((i) => i.correct);
  const marksAvailable = sum(items.map((i) => i.question.marks));
  const marksObtained = sum(items.map((i) => i.marks));
  return {
    key,
    label,
    total: items.length,
    attempted: attempted.length,
    correct: correct.length,
    wrong: attempted.length - correct.length,
    unanswered: items.length - attempted.length,
    marksObtained: r4(marksObtained),
    marksAvailable,
    negativeMarks: r4(sum(items.filter((i) => i.marks < 0).map((i) => -i.marks))),
    accuracy: ratio(correct.length, attempted.length),
    attemptRate: items.length ? attempted.length / items.length : 0,
    scoreShare: marksAvailable ? marksObtained / marksAvailable : 0,
    avgSec: items.length ? sum(items.map((i) => i.spentMs)) / 1000 / items.length : 0,
  };
}

function group(
  items: GradedItem[],
  keyOf: (i: GradedItem) => string,
  labelOf: (i: GradedItem) => string,
): GroupRow[] {
  const map = new Map<string, { label: string; items: GradedItem[] }>();
  for (const i of items) {
    const k = keyOf(i);
    const g = map.get(k) ?? { label: labelOf(i), items: [] };
    g.items.push(i);
    map.set(k, g);
  }
  return [...map.entries()].map(([k, g]) => toRow(k, g.label, g.items));
}

/** Weakest first; ties broken by more marks at stake. */
const weakestFirst = (a: GroupRow, b: GroupRow) =>
  a.scoreShare - b.scoreShare || b.marksAvailable - a.marksAvailable;

export function computeMockAnalytics(items: GradedItem[], ctx: AnalyticsContext): MockAnalytics {
  const total = items.length;
  const attempted = items.filter((i) => i.attempted);
  const correct = attempted.filter((i) => i.correct);

  // ── score ──
  const obtained = sum(items.map((i) => i.marks));
  const max = sum(items.map((i) => i.question.marks));
  const gained = sum(items.filter((i) => i.marks > 0).map((i) => i.marks));
  const negative = sum(items.filter((i) => i.marks < 0).map((i) => -i.marks));

  // ── time ──
  const accountedSec = sum(items.map((i) => i.spentMs)) / 1000;
  const timeLostSec = sum(
    items
      .filter((i) => !(i.attempted && i.correct))
      .map((i) => Math.max(0, i.spentMs / 1000 - i.question.marks * ctx.expectedSecPerMark)),
  );

  // ── did changing answers help? ──
  const firstAnswered = items.filter((i) => i.firstAttempted);
  const changed = firstAnswered.filter((i) => !answersEqual(i.firstAnswer, i.finalAnswer));
  const changedToAnswer = changed.filter((i) => i.attempted);
  const unchanged = attempted.filter((i) => !changed.includes(i));

  // ── guessing (student flagged "guessed" while answering) ──
  const guessed = attempted.filter((i) => i.guessed);

  // ── marked for review ──
  const marked = items.filter((i) => i.markedForReview);
  const markedAttempted = marked.filter((i) => i.attempted);

  const changedSet = new Set(changed.map((i) => i.position));
  const perQuestion: PerQuestionRow[] = items.map((i) => ({
    position: i.position,
    questionId: i.question.id,
    section: i.question.section,
    type: i.question.type,
    subjectName: i.question.subjectName,
    unitName: i.question.unitName,
    topicName: i.question.topicName,
    marksAvailable: i.question.marks,
    marksObtained: r4(i.marks),
    outcome: outcomeOf(i),
    spentSec: Math.round(i.spentMs / 1000),
    markedForReview: i.markedForReview,
    guessed: i.guessed,
    changedAnswer: changedSet.has(i.position),
    finalAnswer: i.finalAnswer,
    firstAnswer: i.firstAnswer,
    wasSeenBefore: i.wasSeenBefore,
  }));

  const sectionOrder: SectionKey[] = ['GA', 'CORE'];

  return {
    version: ANALYTICS_VERSION,
    score: {
      obtained: r4(obtained),
      max,
      share: max ? obtained / max : 0,
      gained: r4(gained),
      negative: r4(negative),
    },
    counts: {
      total,
      attempted: attempted.length,
      correct: correct.length,
      wrong: attempted.length - correct.length,
      unanswered: total - attempted.length,
    },
    accuracy: ratio(correct.length, attempted.length),
    attemptRate: total ? attempted.length / total : 0,
    time: {
      allottedSec: ctx.durationSec,
      usedSec: ctx.usedSec,
      unusedSec: Math.max(0, ctx.durationSec - ctx.usedSec),
      accountedSec: Math.round(accountedSec),
      avgSecPerQuestion: total ? accountedSec / total : 0,
      avgSecPerAttempted: attempted.length
        ? sum(attempted.map((i) => i.spentMs)) / 1000 / attempted.length
        : null,
      timeLostSec: Math.round(timeLostSec),
    },
    answerChanges: {
      firstAttemptAccuracy: ratio(firstAnswered.filter((i) => i.firstCorrect).length, firstAnswered.length),
      finalAccuracy: ratio(correct.length, attempted.length),
      changedCount: changed.length,
      changedAccuracy: ratio(changedToAnswer.filter((i) => i.correct).length, changedToAnswer.length),
      unchangedAccuracy: ratio(unchanged.filter((i) => i.correct).length, unchanged.length),
      wrongToRight: changedToAnswer.filter((i) => !i.firstCorrect && i.correct).length,
      rightToWrong: changedToAnswer.filter((i) => i.firstCorrect && !i.correct).length,
      wrongToWrong: changedToAnswer.filter((i) => !i.firstCorrect && !i.correct).length,
      clearedToBlank: changed.filter((i) => !i.attempted).length,
      netMarks: r4(sum(changed.map((i) => i.marks - i.firstMarks))),
    },
    guessing: {
      guessedAttempted: guessed.length,
      guessRate: ratio(guessed.length, attempted.length),
      guessedCorrect: guessed.filter((i) => i.correct).length,
      guessAccuracy: ratio(guessed.filter((i) => i.correct).length, guessed.length),
      netMarks: r4(sum(guessed.map((i) => i.marks))),
    },
    reviewed: {
      marked: marked.length,
      markedAttempted: markedAttempted.length,
      markedCorrect: markedAttempted.filter((i) => i.correct).length,
      accuracy: ratio(markedAttempted.filter((i) => i.correct).length, markedAttempted.length),
    },
    bySection: group(items, (i) => i.question.section, (i) => ctx.sectionLabels[i.question.section]).sort(
      (a, b) => sectionOrder.indexOf(a.key as SectionKey) - sectionOrder.indexOf(b.key as SectionKey),
    ),
    bySubject: group(items, (i) => i.question.subjectId, (i) => i.question.subjectName).sort(weakestFirst),
    byUnit: group(
      items,
      (i) => i.question.unitId,
      (i) => `${i.question.subjectName} · ${i.question.unitName}`,
    ).sort(weakestFirst),
    byTopic: group(
      items.filter((i) => i.question.topicId),
      (i) => i.question.topicId!,
      (i) => `${i.question.unitName} · ${i.question.topicName ?? ''}`,
    ).sort(weakestFirst),
    byType: group(items, (i) => i.question.type, (i) => TYPE_LABEL[i.question.type]).sort(
      (a, b) => ['MCQ', 'MSQ', 'NAT'].indexOf(a.key) - ['MCQ', 'MSQ', 'NAT'].indexOf(b.key),
    ),
    byMarks: group(items, (i) => String(i.question.marks), (i) => `${i.question.marks}-mark`).sort(
      (a, b) => Number(a.key) - Number(b.key),
    ),
    perQuestion,
  };
}
