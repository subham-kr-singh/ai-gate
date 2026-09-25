/**
 * Question import against a real database.
 *
 *   RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/question-import.test.ts
 *
 * Covers the promise the import scripts make: re-importing the same payload is
 * a no-op. The trap is the concept attachments — QuestionConcept is unique on
 * (questionId, conceptId), and Prisma turns a nested `create` inside an
 * `update` into a plain INSERT, so a naive upsert passes the first time and
 * throws on the second.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "1";

describe.skipIf(!shouldRun)("question import idempotency", () => {
  let db: typeof import("@/server/db/client").db;
  let importQuestion: typeof import("@/server/domains/questions/question.service").importQuestion;

  const tag = `qimport-test-${Date.now()}`;
  let subjectId: string;
  let unitId: string;
  let topicId: string;
  let conceptId: string;
  const createdQuestionIds: string[] = [];

  const payload = () => ({
    subjectId,
    unitId,
    topicId,
    conceptIds: [conceptId],
    type: "MCQ" as const,
    marks: 1,
    statement: `Which traversal visits a node before its children? (${tag})`,
    options: [
      { id: "A", text: "Pre-order" },
      { id: "B", text: "Post-order" },
    ],
    correctAnswer: "A",
    source: tag,
    status: "APPROVED" as const,
  });

  beforeAll(async () => {
    ({ db } = await import("@/server/db/client"));
    ({ importQuestion } = await import("@/server/domains/questions/question.service"));

    const version = await db.syllabusVersion.findFirst({ where: { isActive: true } });
    if (!version) throw new Error("No active syllabus version — seed the database first.");

    const concept = await db.concept.findFirstOrThrow({
      where: { topic: { unit: { subject: { syllabusVersionId: version.id } } } },
      select: { id: true, topic: { select: { id: true, unit: { select: { id: true, subjectId: true } } } } },
    });
    conceptId = concept.id;
    topicId = concept.topic.id;
    unitId = concept.topic.unit.id;
    subjectId = concept.topic.unit.subjectId;
  });

  afterAll(async () => {
    if (createdQuestionIds.length) {
      await db.question.deleteMany({ where: { id: { in: createdQuestionIds } } });
    }
  });

  it("creates the question on first import", async () => {
    const q = await importQuestion(payload());
    createdQuestionIds.push(q.id);
    expect(q.status).toBe("APPROVED");

    const links = await db.questionConcept.count({ where: { questionId: q.id } });
    expect(links).toBe(1);
  });

  it("is a no-op on a repeat import rather than a unique-constraint error", async () => {
    const again = await importQuestion(payload());

    // Same row, not a duplicate.
    expect(again.id).toBe(createdQuestionIds[0]);
    expect((await db.question.findMany({ where: { source: tag } })).length).toBe(1);

    // And the concept link was not inserted twice.
    const links = await db.questionConcept.count({ where: { questionId: again.id } });
    expect(links).toBe(1);
  });

  it("still updates scalar fields on a repeat import", async () => {
    const updated = await importQuestion({ ...payload(), solution: "Pre-order visits the root first." });
    expect(updated.id).toBe(createdQuestionIds[0]);
    expect(updated.solution).toBe("Pre-order visits the root first.");
  });
});
