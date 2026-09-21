/**
 * ts-fsrs integration (architecture section 67). Pure mapping between a
 * Flashcard row and a ts-fsrs Card — no database access, so it is unit-testable.
 * FSRS decides the next review; we never hand-roll a spaced-repetition rule.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";

export const DESIRED_RETENTION = 0.9;

const scheduler = fsrs(
  generatorParameters({
    request_retention: DESIRED_RETENTION,
    // Fuzz would make a single student's schedule non-reproducible; not worth it at this scale.
    enable_fuzz: false,
  }),
);

export interface FsrsRow {
  state: number;
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReview: Date | null;
}

export type GradeName = "again" | "hard" | "good" | "easy";
export const GRADES: Record<GradeName, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export function newCardRow(now: Date): FsrsRow {
  return cardToRow(createEmptyCard(now));
}

export function cardToRow(card: Card): FsrsRow {
  const c = card as unknown as Record<string, unknown>;
  const num = (k: string) => (typeof c[k] === "number" ? (c[k] as number) : 0);
  return {
    state: card.state as number,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: num("elapsed_days"),
    scheduledDays: num("scheduled_days"),
    learningSteps: num("learning_steps"),
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review ?? null,
  };
}

export function rowToCard(row: FsrsRow, now: Date): Card {
  // Start from an empty card so fields added by newer ts-fsrs versions get sane defaults.
  return {
    ...(createEmptyCard(now) as Record<string, unknown>),
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.lastReview ?? undefined,
  } as unknown as Card;
}

export function reviewRow(row: FsrsRow, grade: Grade, now: Date): { row: FsrsRow; scheduledDays: number } {
  const { card } = scheduler.next(rowToCard(row, now), now, grade);
  const next = cardToRow(card);
  return { row: next, scheduledDays: next.scheduledDays };
}

/** When the card would next be due for each answer — used to label the rating buttons. */
export function previewDue(row: FsrsRow, now: Date): Record<GradeName, Date> {
  const rec = scheduler.repeat(rowToCard(row, now), now);
  return {
    again: rec[Rating.Again].card.due,
    hard: rec[Rating.Hard].card.due,
    good: rec[Rating.Good].card.due,
    easy: rec[Rating.Easy].card.due,
  };
}
