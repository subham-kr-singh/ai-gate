import type { Prisma } from "@prisma/client";
import { db } from "@/server/db/client";
import type { QuestionInput } from "@/server/domains/questions/question.schema";

/** Most recent completed run for a source with identical bytes. Used to make
 * a re-run of an unchanged corpus a no-op. */
export async function findCompletedIngestion(sourceId: string, contentHash: string) {
  return db.sourceIngestion.findFirst({
    where: { sourceId, contentHash, status: "completed" },
    orderBy: { startedAt: "desc" },
  });
}

export async function startIngestion(data: {
  sourceId: string;
  sourceUrl: string;
  license: string | null;
  upstreamRef: string | null;
  contentHash: string;
}) {
  return db.sourceIngestion.create({ data: { ...data, status: "running" } });
}

export async function finishIngestion(
  id: string,
  data: {
    status: "completed" | "failed";
    questionCount: number;
    importedCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    error?: string | null;
    report: Prisma.InputJsonValue;
  }
) {
  return db.sourceIngestion.update({
    where: { id },
    data: { ...data, finishedAt: new Date() },
  });
}

export async function listIngestions(limit = 20) {
  return db.sourceIngestion.findMany({ orderBy: { startedAt: "desc" }, take: limit });
}

/**
 * Closes out `running` rows left behind by a process that died mid-import.
 *
 * A serverless function killed at the platform timeout never reaches the
 * catch block, so the row it opened stays `running` forever and every later
 * run looks like it is still in flight. Nothing else reads those rows for
 * correctness (idempotency keys off `completed` runs only), but leaving them
 * makes the run history — the one place an import can be audited — wrong.
 */
export async function markStaleIngestions(olderThanMinutes = 30) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const { count } = await db.sourceIngestion.updateMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    data: {
      status: "failed",
      error: `Timed out or interrupted; no completion recorded within ${olderThanMinutes} minutes.`,
      finishedAt: new Date(),
    },
  });
  return count;
}

export async function countQuestions(): Promise<number> {
  return db.question.count();
}

/**
 * Upserts a question by content hash, replacing its concept links on update.
 *
 * `question.service.importQuestion` is fine for a first insert, but its
 * upsert would attempt to `create` concept rows that already exist on a
 * second run and trip the `[questionId, conceptId]` unique index. Because
 * this importer is explicitly re-runnable, concept links are deleted and
 * recreated inside the same transaction instead.
 */
export async function upsertQuestion(
  input: QuestionInput,
  contentHash: string
): Promise<{ id: string; created: boolean }> {
  const { conceptIds, subjectId, unitId, topicId, options, natTolerance, ...rest } = input;

  const scalars = {
    subjectId,
    unitId,
    topicId,
    type: rest.type,
    marks: rest.marks,
    negativeMarks: rest.negativeMarks,
    statement: rest.statement,
    options: (options ?? undefined) as Prisma.InputJsonValue | undefined,
    correctAnswer: rest.correctAnswer as Prisma.InputJsonValue,
    natTolerance: (natTolerance ?? undefined) as Prisma.InputJsonValue | undefined,
    solution: rest.solution,
    year: rest.year,
    source: rest.source,
    sourceUrl: rest.sourceUrl,
    license: rest.license,
    difficulty: rest.difficulty,
    status: rest.status,
  };

  return db.$transaction(async (tx) => {
    const existing = await tx.question.findUnique({ where: { contentHash }, select: { id: true } });
    if (existing) {
      await tx.questionConcept.deleteMany({ where: { questionId: existing.id } });
      const question = await tx.question.update({ where: { id: existing.id }, data: scalars });
      if (conceptIds.length > 0) {
        await tx.questionConcept.createMany({
          data: conceptIds.map((conceptId) => ({ questionId: question.id, conceptId })),
          skipDuplicates: true,
        });
      }
      return { id: question.id, created: false };
    }

    const question = await tx.question.create({
      data: {
        ...scalars,
        contentHash,
        concepts: conceptIds.length
          ? { create: conceptIds.map((conceptId) => ({ conceptId })) }
          : undefined,
      },
    });
    return { id: question.id, created: true };
  });
}
