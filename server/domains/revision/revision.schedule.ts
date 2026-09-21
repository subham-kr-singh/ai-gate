/**
 * Pre-FSRS review scheduling: a fixed interval ladder per concept.
 * Part 5 moves flashcards to ts-fsrs; this stays the concept-level fallback.
 */
export const REVISION_LADDER_VERSION = "v1";
export const DEFAULT_LADDER_DAYS: readonly number[] = [1, 3, 7, 14, 30];

export interface ReviewSnapshot {
  stage: number;
  lapses: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
}

const DAY_MS = 86_400_000;
const EARLY_TOLERANCE_MS = 12 * 3_600_000;

export function scheduleNextReview(
  prev: ReviewSnapshot | null,
  correct: boolean,
  now: Date,
  ladder: readonly number[] = DEFAULT_LADDER_DAYS,
): ReviewSnapshot {
  const last = ladder.length - 1;
  const due = (days: number) => new Date(now.getTime() + days * DAY_MS);

  if (!correct) {
    // Only a miss on something already on the ladder counts as a lapse.
    const lapse = prev && prev.stage >= 1 ? 1 : 0;
    return { stage: 0, lapses: (prev?.lapses ?? 0) + lapse, dueAt: due(ladder[0] ?? 1), lastReviewedAt: now };
  }
  if (!prev) {
    const stage = Math.min(1, last);
    return { stage, lapses: 0, dueAt: due(ladder[stage] ?? 1), lastReviewedAt: now };
  }
  // Correct answers well before the due date do not climb the ladder.
  if (now.getTime() < prev.dueAt.getTime() - EARLY_TOLERANCE_MS) {
    return { ...prev, lastReviewedAt: now };
  }
  const stage = Math.min(prev.stage + 1, last);
  return { stage, lapses: prev.lapses, dueAt: due(ladder[stage] ?? 1), lastReviewedAt: now };
}

/** First review after a study report says the concept was covered. */
export function initialReviewAfterStudy(now: Date, ladder: readonly number[] = DEFAULT_LADDER_DAYS): ReviewSnapshot {
  return { stage: 0, lapses: 0, dueAt: new Date(now.getTime() + (ladder[0] ?? 1) * DAY_MS), lastReviewedAt: now };
}
