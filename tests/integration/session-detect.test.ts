/**
 * Proves "Log study session" now *detects* work instead of asking for it:
 * a submitted quiz becomes a readable session with the right unit, counts and
 * weak concepts — and detection is read-only, so re-running it never
 * double-counts against mastery.
 *
 *   RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/session-detect.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "1";

describe.skipIf(!shouldRun)("auto-detected study sessions", () => {
  let db: typeof import("@/server/db/client").db;
  let importQuestion: typeof import("@/server/domains/questions/question.service").importQuestion;
  let startTest: typeof import("@/server/domains/tests/test.service").startTest;
  let autosaveAnswer: typeof import("@/server/domains/tests/test.service").autosaveAnswer;
  let submitTest: typeof import("@/server/domains/tests/test.service").submitTest;
  let detectStudySessions: typeof import("@/server/domains/mastery/session-detect.service").detectStudySessions;

  let userId: string;
  let unitName: string;
  let conceptName: string;
  let questionId: string;

  beforeAll(async () => {
    ({ db } = await import("@/server/db/client"));
    ({ importQuestion } = await import("@/server/domains/questions/question.service"));
    ({ startTest, autosaveAnswer, submitTest } = await import("@/server/domains/tests/test.service"));
    ({ detectStudySessions } = await import("@/server/domains/mastery/session-detect.service"));

    const user = await db.user.create({ data: { email: `detect-${Date.now()}@example.com` } });
    userId = user.id;

    const version = await db.syllabusVersion.create({ data: { label: `det-${Date.now()}`, isActive: false } });
    const subject = await db.subject.create({
      data: { syllabusVersionId: version.id, code: "DET", name: "Detection Subject", order: 1 },
    });
    const unit = await db.unit.create({ data: { subjectId: subject.id, name: "Detection Unit", order: 1 } });
    const topic = await db.topic.create({ data: { unitId: unit.id, name: "Detection Topic", order: 1 } });
    const concept = await db.concept.create({ data: { topicId: topic.id, name: "Detection Concept", order: 1 } });
    unitName = unit.name;
    conceptName = concept.name;

    await db.markingScheme.upsert({
      where: { examYear_questionType: { examYear: 2099, questionType: "MCQ" } },
      update: {},
      create: { examYear: 2099, questionType: "MCQ", positiveMarks: 1, negativeMarksFraction: 1 / 3 },
    });

    const q = await importQuestion({
      subjectId: subject.id,
      unitId: unit.id,
      topicId: topic.id,
      conceptIds: [concept.id],
      type: "MCQ",
      marks: 1,
      statement: "Detection question?",
      options: [
        { id: "a", text: "wrong" },
        { id: "b", text: "right" },
      ],
      correctAnswer: "b",
      status: "APPROVED",
    });
    questionId = q.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("returns nothing before any work is submitted", async () => {
    expect(await detectStudySessions(userId)).toEqual([]);
  });

  it("turns a submitted quiz into a session with the unit, counts and weak concepts", async () => {
    const test = await startTest({
      userId,
      type: "TOPIC_QUIZ",
      examYear: 2099,
      title: "Detection quiz",
      questionIds: [questionId],
    });
    await autosaveAnswer(test.id, userId, { questionId, seq: 0, selectedAnswer: "a" });
    await submitTest(test.id, userId);

    const sessions = await detectStudySessions(userId);
    expect(sessions).toHaveLength(1);

    const s = sessions[0]!;
    expect(s.unitName).toBe(unitName);
    expect(s.questionsAttempted).toBe(1);
    expect(s.questionsCorrect).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.sources.quiz).toBe(1);
    expect(s.weakConcepts.map((c) => c.name)).toContain(conceptName);
  });

  it("is read-only: detecting again does not change mastery", async () => {
    const before = await db.conceptStats.findFirst({ where: { userId } });
    await detectStudySessions(userId);
    await detectStudySessions(userId);
    const after = await db.conceptStats.findFirst({ where: { userId } });
    expect(after!.attempts).toBe(before!.attempts);
  });

  it("rolls repeated quizzes on the same unit and day into one session", async () => {
    const test = await startTest({
      userId,
      type: "TOPIC_QUIZ",
      examYear: 2099,
      title: "Second quiz",
      questionIds: [questionId],
    });
    await autosaveAnswer(test.id, userId, { questionId, seq: 0, selectedAnswer: "b" });
    await submitTest(test.id, userId);

    const sessions = await detectStudySessions(userId, { days: 30 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.questionsAttempted).toBe(2);
    expect(sessions[0]!.questionsCorrect).toBe(1);
    expect(sessions[0]!.weakConcepts[0]?.correct).toBe(1);
    expect(sessions[0]!.weakConcepts[0]?.attempted).toBe(2);
  });
});
