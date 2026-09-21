import { db } from "@/server/db/client";
import type { TestType } from "@prisma/client";

export async function createTest(params: {
  userId: string;
  type: TestType;
  examYear: number;
  title: string;
  questionIds: string[];
  deadlineAt?: Date;
}) {
  return db.test.create({
    data: {
      userId: params.userId,
      type: params.type,
      examYear: params.examYear,
      title: params.title,
      deadlineAt: params.deadlineAt,
      testQuestions: {
        create: params.questionIds.map((questionId, i) => ({
          questionId,
          order: i + 1,
        })),
      },
    },
    include: { testQuestions: { orderBy: { order: "asc" } } },
  });
}

export async function findTestForUser(testId: string, userId: string) {
  return db.test.findFirst({
    where: { id: testId, userId },
    include: {
      testQuestions: {
        orderBy: { order: "asc" },
        include: { question: true },
      },
    },
  });
}

export async function updateDraftAnswers(testId: string, draftAnswers: unknown) {
  return db.test.update({
    where: { id: testId },
    data: { draftAnswers: draftAnswers as any },
  });
}

export async function markSubmitted(
  testId: string,
  data: { totalMarks: number; scoredMarks: number; accuracy: number }
) {
  return db.test.update({
    where: { id: testId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      totalMarks: data.totalMarks,
      scoredMarks: data.scoredMarks,
      accuracy: data.accuracy,
    },
  });
}

export async function findAttemptsForUser(userId: string, limit = 50) {
  return db.attempt.findMany({
    where: { userId },
    orderBy: { submittedAt: "desc" },
    take: limit,
    include: { test: true },
  });
}

export async function findResultForUser(testId: string, userId: string) {
  return db.test.findFirst({
    where: { id: testId, userId, status: "SUBMITTED" },
    include: {
      attempts: {
        orderBy: { submittedAt: "desc" },
        take: 1,
        include: {
          answers: {
            orderBy: { seq: "asc" },
            include: { question: true },
          },
        },
      },
    },
  });
}
