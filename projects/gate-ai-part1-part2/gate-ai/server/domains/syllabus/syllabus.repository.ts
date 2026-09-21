import { db } from "@/server/db/client";

export async function findActiveSyllabusVersion() {
  return db.syllabusVersion.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function findSyllabusTreeRows(syllabusVersionId: string) {
  return db.subject.findMany({
    where: { syllabusVersionId },
    orderBy: { order: "asc" },
    include: {
      units: {
        orderBy: { order: "asc" },
        include: {
          topics: {
            orderBy: { order: "asc" },
            include: {
              concepts: { orderBy: { order: "asc" } },
            },
          },
        },
      },
    },
  });
}

export async function findSubjectById(subjectId: string) {
  return db.subject.findUnique({
    where: { id: subjectId },
    include: {
      units: {
        orderBy: { order: "asc" },
        include: {
          topics: {
            orderBy: { order: "asc" },
            include: { concepts: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
}

/** All (subject, unit, topic, concept) rows flattened, for lightweight
 * fuzzy-matching in syllabus.service#resolveEntity — avoids pulling in a
 * search library for a few hundred rows. */
export async function findAllEntityNames(syllabusVersionId: string) {
  const subjects = await db.subject.findMany({
    where: { syllabusVersionId },
    select: {
      id: true,
      code: true,
      name: true,
      units: {
        select: {
          id: true,
          name: true,
          topics: {
            select: {
              id: true,
              name: true,
              concepts: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  return subjects;
}
