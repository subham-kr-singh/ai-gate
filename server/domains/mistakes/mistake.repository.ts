import type { Prisma } from "@prisma/client";
import { db as prisma } from "@/server/db/client";
import type { Db } from "../shared/db";
import type { MistakeFilters, MistakeTypeValue } from "./mistake.types";

export interface NewMistake {
  userId: string;
  answerId?: string | null;
  questionId?: string | null;
  unitId?: string | null;
  topicId?: string | null;
  conceptIds: string[];
}

/** Creates an untagged mistake for a wrong answer. Idempotent per answerId. */
export async function createUntaggedMistake(db: Db, m: NewMistake): Promise<{ id: string; created: boolean }> {
  if (m.answerId) {
    const existing = await db.mistake.findUnique({
      where: { userId_answerId: { userId: m.userId, answerId: m.answerId } },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
  }
  const row = await db.mistake.create({
    data: {
      userId: m.userId,
      answerId: m.answerId ?? null,
      questionId: m.questionId ?? null,
      unitId: m.unitId ?? null,
      topicId: m.topicId ?? null,
      concepts: { create: [...new Set(m.conceptIds)].map((conceptId) => ({ conceptId })) },
    },
    select: { id: true },
  });
  return { id: row.id, created: true };
}

/** A later correct answer to the same question closes its open mistakes. */
export async function autoResolveForQuestion(db: Db, userId: string, questionId: string, at: Date): Promise<void> {
  await db.mistake.updateMany({
    where: { userId, questionId, resolved: false },
    data: { resolved: true, resolvedAt: at },
  });
}

export const countOpenMistakes = (db: Db, userId: string, unitId?: string): Promise<number> =>
  db.mistake.count({ where: { userId, resolved: false, ...(unitId ? { unitId } : {}) } });

export async function findOwned(db: Db, userId: string, ref: { mistakeId?: string; answerId?: string }) {
  if (ref.mistakeId) return db.mistake.findFirst({ where: { id: ref.mistakeId, userId } });
  if (ref.answerId) return db.mistake.findUnique({ where: { userId_answerId: { userId, answerId: ref.answerId } } });
  return null;
}

export async function setType(db: Db, id: string, type: MistakeTypeValue, note?: string): Promise<void> {
  await db.mistake.update({
    where: { id },
    data: {
      mistakeType: type,
      classificationSource: "USER",
      classificationConfidence: 1,
      ...(note !== undefined ? { note } : {}),
    },
  });
}

export async function setResolved(db: Db, id: string, resolved: boolean, at: Date): Promise<void> {
  await db.mistake.update({ where: { id }, data: { resolved, resolvedAt: resolved ? at : null } });
}

export function buildWhere(userId: string, f: MistakeFilters, unitIdsForSubject?: string[]): Prisma.MistakeWhereInput {
  const where: Prisma.MistakeWhereInput = { userId };
  if (f.type === "UNTAGGED") where.mistakeType = null;
  else if (f.type) where.mistakeType = f.type;
  if (f.unitId) where.unitId = f.unitId;
  else if (unitIdsForSubject) where.unitId = { in: unitIdsForSubject };
  const status = f.status ?? "open";
  if (status === "open") where.resolved = false;
  if (status === "resolved") where.resolved = true;
  return where;
}

export const listRows = (where: Prisma.MistakeWhereInput, limit: number) =>
  prisma.mistake.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, include: { concepts: true } });

export const groupOpenByType = (userId: string) =>
  prisma.mistake.groupBy({ by: ["mistakeType"], where: { userId, resolved: false }, _count: { _all: true } });
