import { z } from "zod";
import { db as prisma } from "@/server/db/client";
import { cardToRow, GRADES, newCardRow, previewDue, reviewRow, type FsrsRow, type GradeName } from "./fsrs.service";

export const FLASHCARD_KINDS = ["FORMULA", "DEFINITION", "ALGORITHM", "TRAP", "COMPARISON", "MISTAKE"] as const;

export const createFlashcardSchema = z.object({
  kind: z.enum(FLASHCARD_KINDS).default("DEFINITION"),
  front: z.string().trim().min(1, "Add the question side.").max(2000),
  back: z.string().trim().min(1, "Add the answer side.").max(4000),
  conceptId: z.string().optional(),
  unitId: z.string().optional(),
});
export const reviewSchema = z.object({ grade: z.enum(["again", "hard", "good", "easy"]) });

export interface DueCard {
  id: string;
  kind: string;
  front: string;
  back: string;
  isNew: boolean;
  /** ISO timestamps of the next due date for each answer. */
  previews: Record<GradeName, string>;
}

const toRow = (c: {
  state: number; due: Date; stability: number; difficulty: number; elapsedDays: number;
  scheduledDays: number; learningSteps: number; reps: number; lapses: number; lastReview: Date | null;
}): FsrsRow => ({ ...c });

export async function createFlashcard(userId: string, input: z.infer<typeof createFlashcardSchema>, now = new Date()) {
  const row = newCardRow(now);
  return prisma.flashcard.create({
    data: { userId, kind: input.kind, front: input.front, back: input.back, conceptId: input.conceptId, unitId: input.unitId, ...row },
  });
}

export async function countDue(userId: string, now = new Date()): Promise<number> {
  return prisma.flashcard.count({ where: { userId, suspended: false, due: { lte: now } } });
}

export async function getDueQueue(userId: string, limit = 20, now = new Date()): Promise<{ cards: DueCard[]; totalDue: number }> {
  const [rows, totalDue] = await Promise.all([
    prisma.flashcard.findMany({ where: { userId, suspended: false, due: { lte: now } }, orderBy: { due: "asc" }, take: limit }),
    countDue(userId, now),
  ]);
  return {
    totalDue,
    cards: rows.map((r) => {
      const p = previewDue(toRow(r), now);
      return {
        id: r.id,
        kind: r.kind,
        front: r.front,
        back: r.back,
        isNew: r.reps === 0,
        previews: { again: p.again.toISOString(), hard: p.hard.toISOString(), good: p.good.toISOString(), easy: p.easy.toISOString() },
      };
    }),
  };
}

export async function reviewFlashcard(userId: string, id: string, grade: GradeName, now = new Date()) {
  const card = await prisma.flashcard.findFirst({ where: { id, userId } });
  if (!card) return null;
  const before = toRow(card);
  const { row, scheduledDays } = reviewRow(before, GRADES[grade], now);
  const [updated] = await prisma.$transaction([
    prisma.flashcard.update({ where: { id }, data: { ...row } }),
    prisma.flashcardReview.create({
      data: {
        flashcardId: id,
        userId,
        rating: GRADES[grade] as number,
        stateBefore: before.state,
        dueBefore: before.due,
        stability: row.stability,
        difficulty: row.difficulty,
        scheduledDays,
        reviewedAt: now,
      },
    }),
  ]);
  return { id: updated.id, nextDue: updated.due.toISOString() };
}

export { cardToRow };
