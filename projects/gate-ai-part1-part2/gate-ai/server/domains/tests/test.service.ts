import * as repo from "./test.repository";
import * as questionRepo from "@/server/domains/questions/question.repository";
import { getMarkingRule } from "@/server/domains/grading/marking-scheme";
import { gradeAnswer, type SubmittedAnswer } from "@/server/domains/grading/grading.service";
import { recordAttempt } from "@/server/domains/attempts/attempt.service";
import type { DraftAnswerEntry, DraftAnswers, SubmitResult } from "./test.types";
import { z } from "zod";

const autosaveInputSchema = z.object({
  questionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  selectedAnswer: z.union([z.string(), z.array(z.string()), z.null()]),
  confidence: z.number().int().min(1).max(4).optional(),
  markedForReview: z.boolean().optional(),
  timeTakenMs: z.number().int().nonnegative().optional(),
});
export type AutosaveInput = z.infer<typeof autosaveInputSchema>;

/** Starts a topic quiz or mock: snapshots a fixed question list onto the
 * Test so later edits to the question bank never change an in-progress
 * or historical test (architecture §22, §66). */
export async function startTest(params: {
  userId: string;
  type: "TOPIC_QUIZ" | "MOCK";
  examYear: number;
  title: string;
  questionIds: string[];
  deadlineAt?: Date;
}) {
  if (params.questionIds.length === 0) {
    throw new Error("Cannot start a test with zero questions.");
  }
  return repo.createTest(params);
}

export async function resumeTest(testId: string, userId: string) {
  const test = await repo.findTestForUser(testId, userId);
  if (!test) throw new Error("Test not found for this user.");
  return test;
}

export async function getRecentAttempts(userId: string) {
  return repo.findAttemptsForUser(userId);
}

export async function getResult(testId: string, userId: string) {
  const test = await repo.findResultForUser(testId, userId);
  if (!test) throw new Error("Result not found — the test may not be submitted yet.");
  return test;
}

/** Autosave a single answer. Idempotent and safe against out-of-order
 * delivery on a flaky connection: an incoming seq that is not strictly
 * greater than the stored seq for that question is silently ignored
 * rather than overwriting a newer answer (architecture "Autosave and
 * Phone Reliability"). */
export async function autosaveAnswer(testId: string, userId: string, rawInput: unknown) {
  const input = autosaveInputSchema.parse(rawInput);
  const test = await repo.findTestForUser(testId, userId);
  if (!test) throw new Error("Test not found for this user.");
  if (test.status !== "IN_PROGRESS") {
    throw new Error(`Cannot autosave — test status is ${test.status}.`);
  }

  const belongsToTest = test.testQuestions.some((tq) => tq.questionId === input.questionId);
  if (!belongsToTest) throw new Error("Question does not belong to this test.");

  const draft: DraftAnswers = (test.draftAnswers as DraftAnswers | null) ?? {};
  const existing = draft[input.questionId];

  if (existing && existing.seq >= input.seq) {
    // Stale/duplicate request — no-op, but not an error (retries are
    // expected on flaky networks).
    return { accepted: false, currentSeq: existing.seq };
  }

  const entry: DraftAnswerEntry = {
    seq: input.seq,
    selectedAnswer: input.selectedAnswer,
    confidence: input.confidence,
    markedForReview: input.markedForReview,
    timeTakenMs: input.timeTakenMs,
    updatedAt: new Date().toISOString(),
  };
  draft[input.questionId] = entry;

  await repo.updateDraftAnswers(testId, draft);
  return { accepted: true, currentSeq: input.seq };
}

/** Submits a test: grades every question deterministically against the
 * configured MarkingScheme, writes the append-only Attempt/Answer
 * record, and marks the Test submitted. Idempotent — resubmitting an
 * already-submitted test returns an error rather than double-grading
 * (architecture §23 "Submissions must be idempotent"). */
export async function submitTest(testId: string, userId: string): Promise<SubmitResult> {
  const test = await repo.findTestForUser(testId, userId);
  if (!test) throw new Error("Test not found for this user.");
  if (test.status === "SUBMITTED") {
    throw new Error("Test has already been submitted.");
  }

  const draft: DraftAnswers = (test.draftAnswers as DraftAnswers | null) ?? {};
  const questionIds = test.testQuestions.map((tq) => tq.questionId);
  const questions = await questionRepo.findByIds(questionIds);
  const questionById = new Map(questions.map((q) => [q.id, q]));

  // Cache marking rules per question type to avoid one query per question.
  const ruleCache = new Map<string, Awaited<ReturnType<typeof getMarkingRule>>>();
  async function ruleFor(type: "MCQ" | "MSQ" | "NAT") {
    const key = `${test.examYear}:${type}`;
    if (!ruleCache.has(key)) {
      ruleCache.set(key, await getMarkingRule(test.examYear, type));
    }
    return ruleCache.get(key)!;
  }

  let totalMarks = 0;
  let scoredMarks = 0;
  let correctCount = 0;
  let attemptedCount = 0;

  const graded: Array<{
    questionId: string;
    selectedAnswer: SubmittedAnswer;
    correct: boolean;
    marks: number;
    timeTakenMs?: number;
    confidence?: number;
    markedForReview?: boolean;
  }> = [];

  for (const questionId of questionIds) {
    const question = questionById.get(questionId);
    if (!question) throw new Error(`Question ${questionId} not found while grading.`);

    totalMarks += question.marks;
    const entry = draft[questionId];
    const submitted: SubmittedAnswer = (entry?.selectedAnswer ?? null) as SubmittedAnswer;
    if (entry?.selectedAnswer !== null && entry?.selectedAnswer !== undefined) {
      attemptedCount += 1;
    }

    const rule = await ruleFor(question.type);
    const result = gradeAnswer(
      {
        type: question.type,
        marks: question.marks,
        correctAnswer: question.correctAnswer,
        natTolerance: question.natTolerance as { min: number; max: number } | null,
      },
      submitted,
      rule
    );

    scoredMarks += result.marks;
    if (result.correct) correctCount += 1;

    graded.push({
      questionId,
      selectedAnswer: submitted,
      correct: result.correct,
      marks: result.marks,
      timeTakenMs: entry?.timeTakenMs,
      confidence: entry?.confidence,
      markedForReview: entry?.markedForReview,
    });
  }

  const accuracy = attemptedCount > 0 ? correctCount / attemptedCount : 0;

  const attempt = await recordAttempt({
    userId,
    testId,
    totalMarks,
    scoredMarks,
    accuracy,
    answers: graded,
  });

  await repo.markSubmitted(testId, { totalMarks, scoredMarks, accuracy });

  return {
    testId,
    attemptId: attempt.id,
    totalMarks,
    scoredMarks,
    accuracy,
    perQuestion: graded.map((g) => ({ questionId: g.questionId, correct: g.correct, marks: g.marks })),
  };
}
