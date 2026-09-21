/**
 * Full test-submission pipeline, against a real (local/dev) database.
 *
 * Requires DATABASE_URL to point at a disposable Postgres instance with
 * the schema migrated (`npx prisma migrate dev`) and the syllabus seeded
 * (`npm run seed`). Skipped automatically when RUN_INTEGRATION_TESTS is
 * not set, so `npm test` stays fast and DB-free by default — run with:
 *
 *   RUN_INTEGRATION_TESTS=1 npm test -- tests/integration
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "1";

describe.skipIf(!shouldRun)("test submission pipeline", () => {
  let db: typeof import("@/server/db/client").db;
  let importQuestion: typeof import("@/server/domains/questions/question.service").importQuestion;
  let startTest: typeof import("@/server/domains/tests/test.service").startTest;
  let autosaveAnswer: typeof import("@/server/domains/tests/test.service").autosaveAnswer;
  let submitTest: typeof import("@/server/domains/tests/test.service").submitTest;

  let userId: string;
  let subjectId: string;
  let unitId: string;
  let topicId: string;
  let questionId: string;

  beforeAll(async () => {
    ({ db } = await import("@/server/db/client"));
    ({ importQuestion } = await import("@/server/domains/questions/question.service"));
    ({ startTest, autosaveAnswer, submitTest } = await import("@/server/domains/tests/test.service"));

    const user = await db.user.create({ data: { email: `test-${Date.now()}@example.com` } });
    userId = user.id;

    const version = await db.syllabusVersion.create({ data: { label: `test-${Date.now()}`, isActive: false } });
    const subject = await db.subject.create({
      data: { syllabusVersionId: version.id, code: "TST", name: "Test Subject", order: 1 },
    });
    const unit = await db.unit.create({ data: { subjectId: subject.id, name: "Test Unit", order: 1 } });
    const topic = await db.topic.create({ data: { unitId: unit.id, name: "Test Topic", order: 1 } });
    subjectId = subject.id;
    unitId = unit.id;
    topicId = topic.id;

    await db.markingScheme.upsert({
      where: { examYear_questionType: { examYear: 2099, questionType: "MCQ" } },
      update: {},
      create: { examYear: 2099, questionType: "MCQ", positiveMarks: 1, negativeMarksFraction: 1 / 3 },
    });

    const question = await importQuestion({
      subjectId,
      unitId,
      topicId,
      conceptIds: [],
      type: "MCQ",
      marks: 1,
      statement: "2 + 2 = ?",
      options: [
        { id: "a", text: "3" },
        { id: "b", text: "4" },
      ],
      correctAnswer: "b",
      status: "APPROVED",
    });
    questionId = question.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("takes a quiz end-to-end and produces a deterministic, immutable score", async () => {
    const test = await startTest({
      userId,
      type: "TOPIC_QUIZ",
      examYear: 2099,
      title: "Integration test quiz",
      questionIds: [questionId],
    });

    const autosaveResult = await autosaveAnswer(test.id, userId, {
      questionId,
      seq: 0,
      selectedAnswer: "b",
    });
    expect(autosaveResult.accepted).toBe(true);

    // A stale (older) seq must be ignored, not overwrite the newer answer.
    const staleResult = await autosaveAnswer(test.id, userId, {
      questionId,
      seq: 0,
      selectedAnswer: "a",
    });
    expect(staleResult.accepted).toBe(false);

    const submission = await submitTest(test.id, userId);
    expect(submission.scoredMarks).toBe(1);
    expect(submission.totalMarks).toBe(1);
    expect(submission.perQuestion[0]?.correct).toBe(true);

    await expect(submitTest(test.id, userId)).rejects.toThrow(/already been submitted/);
  });
});
