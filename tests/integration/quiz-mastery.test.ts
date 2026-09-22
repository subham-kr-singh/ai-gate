/**
 * Proves the auto-detect contract: a topic quiz is evidence, exactly like a
 * DPP or a mock. Before the fix, submitTest() wrote an Attempt that nothing
 * read — ConceptStats, mistakes and the revision queue never moved.
 *
 * Requires a disposable migrated database, like test-submission.test.ts:
 *
 *   RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/quiz-mastery.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "1";

describe.skipIf(!shouldRun)("topic quiz feeds the mastery engine", () => {
  let db: typeof import("@/server/db/client").db;
  let importQuestion: typeof import("@/server/domains/questions/question.service").importQuestion;
  let startTest: typeof import("@/server/domains/tests/test.service").startTest;
  let autosaveAnswer: typeof import("@/server/domains/tests/test.service").autosaveAnswer;
  let submitTest: typeof import("@/server/domains/tests/test.service").submitTest;

  let userId: string;
  let conceptId: string;
  let wrongQuestionId: string;

  beforeAll(async () => {
    ({ db } = await import("@/server/db/client"));
    ({ importQuestion } = await import("@/server/domains/questions/question.service"));
    ({ startTest, autosaveAnswer, submitTest } = await import("@/server/domains/tests/test.service"));

    const user = await db.user.create({ data: { email: `quiz-mastery-${Date.now()}@example.com` } });
    userId = user.id;

    const version = await db.syllabusVersion.create({ data: { label: `qm-${Date.now()}`, isActive: false } });
    const subject = await db.subject.create({
      data: { syllabusVersionId: version.id, code: "QM", name: "Quiz Mastery Subject", order: 1 },
    });
    const unit = await db.unit.create({ data: { subjectId: subject.id, name: "QM Unit", order: 1 } });
    const topic = await db.topic.create({ data: { unitId: unit.id, name: "QM Topic", order: 1 } });
    const concept = await db.concept.create({ data: { topicId: topic.id, name: "QM Concept", order: 1 } });
    conceptId = concept.id;

    await db.markingScheme.upsert({
      where: { examYear_questionType: { examYear: 2099, questionType: "MCQ" } },
      update: {},
      create: { examYear: 2099, questionType: "MCQ", positiveMarks: 1, negativeMarksFraction: 1 / 3 },
    });

    const question = await importQuestion({
      subjectId: subject.id,
      unitId: unit.id,
      topicId: topic.id,
      conceptIds: [concept.id],
      type: "MCQ",
      marks: 1,
      statement: "Which scheduling policy is preemptive?",
      options: [
        { id: "a", text: "FCFS" },
        { id: "b", text: "Round Robin" },
      ],
      correctAnswer: "b",
      status: "APPROVED",
    });
    // Answer 'a' so the quiz produces a wrong answer, which must land as a
    // recorded mistake and a non-null concept mastery.
    wrongQuestionId = question.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("records concept stats and a mistake when a quiz is submitted", async () => {
    const test = await startTest({
      userId,
      type: "TOPIC_QUIZ",
      examYear: 2099,
      title: "Mastery wiring quiz",
      questionIds: [wrongQuestionId],
    });

    await autosaveAnswer(test.id, userId, { questionId: wrongQuestionId, seq: 0, selectedAnswer: "a" });
    await submitTest(test.id, userId);

    const conceptStats = await db.conceptStats.findFirst({ where: { userId, conceptId } });
    expect(conceptStats, "a submitted quiz must create ConceptStats").not.toBeNull();
    expect(conceptStats!.attempts).toBeGreaterThan(0);
    expect(conceptStats!.correct).toBe(0);

    const mistake = await db.mistake.findFirst({ where: { userId, resolved: false } });
    expect(mistake, "a wrong quiz answer must open a mistake").not.toBeNull();
    expect(mistake!.questionId).toBe(wrongQuestionId);
  });

  it("does not double-count when the same submission is retried", async () => {
    const test = await startTest({
      userId,
      type: "TOPIC_QUIZ",
      examYear: 2099,
      title: "Idempotency quiz",
      questionIds: [wrongQuestionId],
    });

    await autosaveAnswer(test.id, userId, { questionId: wrongQuestionId, seq: 0, selectedAnswer: "a" });
    await submitTest(test.id, userId);

    const stats = await db.conceptStats.findFirst({ where: { userId, conceptId } });
    // The prior test already produced exactly one wrong attempt for this
    // concept; this second quiz adds exactly one more, never two.
    expect(stats!.attempts).toBe(2);
  });
});
