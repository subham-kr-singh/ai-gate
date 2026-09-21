import { db as prisma } from "@/server/db/client";
import type { Db } from "../shared/db";
import { getConceptLabels } from "../syllabus/syllabus.lookup";
import { REVISION_LADDER_VERSION, initialReviewAfterStudy, scheduleNextReview } from "./revision.schedule";

/** Move each concept's review date after a graded answer. */
export async function applyReviewOutcome(
  db: Db,
  userId: string,
  conceptIds: string[],
  correct: boolean,
  now: Date,
): Promise<void> {
  for (const conceptId of conceptIds) {
    const prev = await db.reviewState.findUnique({ where: { userId_conceptId: { userId, conceptId } } });
    const next = scheduleNextReview(
      prev ? { stage: prev.stage, lapses: prev.lapses, dueAt: prev.dueAt, lastReviewedAt: prev.lastReviewedAt } : null,
      correct,
      now,
    );
    const data = { ...next, ladderVersion: REVISION_LADDER_VERSION };
    await db.reviewState.upsert({
      where: { userId_conceptId: { userId, conceptId } },
      create: { userId, conceptId, ...data },
      update: data,
    });
  }
}

/** Put newly-studied concepts on the ladder without disturbing existing ones. */
export async function seedReviewsAfterStudy(db: Db, userId: string, conceptIds: string[], now: Date): Promise<void> {
  if (!conceptIds.length) return;
  const first = initialReviewAfterStudy(now);
  await db.reviewState.createMany({
    data: conceptIds.map((conceptId) => ({ userId, conceptId, ...first, ladderVersion: REVISION_LADDER_VERSION })),
    skipDuplicates: true,
  });
}

export interface DueReview {
  conceptId: string;
  concept: string;
  topic: string;
  unitId: string;
  dueAt: Date;
  stage: number;
  lapses: number;
}

export async function getDueReviews(userId: string, now = new Date(), limit = 20): Promise<DueReview[]> {
  const rows = await prisma.reviewState.findMany({
    where: { userId, dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: limit,
  });
  const labels = await getConceptLabels(rows.map((r) => r.conceptId));
  return rows.flatMap((r) => {
    const l = labels.get(r.conceptId);
    return l ? [{ conceptId: r.conceptId, concept: l.concept, topic: l.topic, unitId: l.unitId, dueAt: r.dueAt, stage: r.stage, lapses: r.lapses }] : [];
  });
}

export const countDueReviews = (userId: string, now = new Date()): Promise<number> =>
  prisma.reviewState.count({ where: { userId, dueAt: { lte: now } } });
