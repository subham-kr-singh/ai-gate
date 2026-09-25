import { db } from "@/server/db/client";
import type { Prisma } from "@prisma/client";
import type { QuestionFilter } from "./question.schema";

export async function findByContentHash(contentHash: string) {
  return db.question.findUnique({ where: { contentHash } });
}

export async function upsertByContentHash(data: Prisma.QuestionCreateInput) {
  const { concepts, ...scalar } = data;
  const question = await db.question.upsert({
    where: { contentHash: data.contentHash },
    update: scalar,
    create: data,
  });

  // A row can already exist under this hash while `importQuestion` is given a
  // conceptId it does not carry — the hash covers statement/type/correctAnswer
  // only, so tests reusing a fixed statement collide with a leftover row whose
  // subject or concepts differ. Reconcile the links explicitly instead of
  // letting the update payload decide: `create` repeats the INSERT on the
  // (questionId, conceptId) unique constraint on a second import, and dropping
  // it leaves the concepts stale.
  const wanted = new Set(
    concepts?.create
      ? (Array.isArray(concepts.create) ? concepts.create : [concepts.create]).map(
          (link) => (link as { concept: { connect: { id: string } } }).concept.connect.id
        )
      : []
  );
  const held = await db.questionConcept.findMany({
    where: { questionId: question.id },
    select: { conceptId: true },
  });
  const missing = [...wanted].filter((id) => !held.some((row) => row.conceptId === id));
  const extra = held.map((row) => row.conceptId).filter((id) => !wanted.has(id));

  if (missing.length || extra.length) {
    await db.$transaction([
      db.questionConcept.deleteMany({ where: { questionId: question.id, conceptId: { in: extra } } }),
      db.questionConcept.createMany({
        data: missing.map((conceptId) => ({ questionId: question.id, conceptId })),
        skipDuplicates: true,
      }),
    ]);
  }

  return question;
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
