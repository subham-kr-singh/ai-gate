import { db } from "@/server/db/client";
import type { Prisma } from "@prisma/client";
import type { QuestionFilter } from "./question.schema";

export async function findByContentHash(contentHash: string) {
  return db.question.findUnique({ where: { contentHash } });
}

export async function upsertByContentHash(data: Prisma.QuestionCreateInput) {
  return db.question.upsert({
    where: { contentHash: data.contentHash },
    update: data,
    create: data,
  });
}

export async function search(filter: QuestionFilter) {
  const where: Prisma.QuestionWhereInput = {
    status: filter.status,
    subjectId: filter.subjectId,
    unitId: filter.unitId,
    topicId: filter.topicId,
    type: filter.type,
    ...(filter.conceptId
      ? { concepts: { some: { conceptId: filter.conceptId } } }
      : {}),
    ...(filter.difficultyMin || filter.difficultyMax
      ? {
          difficulty: {
            gte: filter.difficultyMin ?? 1,
            lte: filter.difficultyMax ?? 5,
          },
        }
      : {}),
  };

  return db.question.findMany({
    where,
    take: filter.limit,
    orderBy: { createdAt: "desc" },
  });
}

export async function findByIds(ids: string[]) {
  return db.question.findMany({ where: { id: { in: ids } } });
}

export async function countBy(where: Prisma.QuestionWhereInput) {
  return db.question.count({ where });
}
