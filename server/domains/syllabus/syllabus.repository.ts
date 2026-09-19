import { prisma } from "@/server/db/client";

export async function findActiveSyllabusVersion() {
  return prisma.syllabusVersion.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function findSyllabusTreeRaw(syllabusVersionId: string) {
  return prisma.subject.findMany({
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
  return prisma.subject.findUnique({
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

/** Resolve a natural-language reference like "OS Unit 2" or "OS-2" to a Unit row. */
export async function findUnitByFuzzyReference(
  subjectName: string,
  unitCode: string,
) {
  return prisma.unit.findFirst({
    where: {
      code: unitCode,
      subject: { name: { contains: subjectName, mode: "insensitive" } },
    },
  });
}
