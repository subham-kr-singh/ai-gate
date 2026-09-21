import { db } from "@/server/db/client";
import type { Prisma } from "@prisma/client";

export async function createAttemptWithAnswers(params: {
  userId: string;
  testId: string;
  totalMarks: number;
  scoredMarks: number;
  accuracy: number;
  answers: Array<{
    questionId: string;
    selectedAnswer: Prisma.InputJsonValue;
    correct: boolean;
    marks: number;
    timeTakenMs?: number;
    confidence?: number;
    markedForReview?: boolean;
  }>;
}) {
  // Single transaction: the Attempt and its Answers are historical
  // evidence and must land together or not at all.
  return db.attempt.create({
    data: {
      userId: params.userId,
      testId: params.testId,
      totalMarks: params.totalMarks,
      scoredMarks: params.scoredMarks,
      accuracy: params.accuracy,
      answers: {
        create: params.answers.map((a, i) => ({
          userId: params.userId,
          questionId: a.questionId,
          seq: i,
          selectedAnswer: a.selectedAnswer,
          correct: a.correct,
          marks: a.marks,
          timeTakenMs: a.timeTakenMs,
          confidence: a.confidence,
          markedForReview: a.markedForReview ?? false,
        })),
      },
    },
    include: { answers: true },
  });
}

export async function findAttemptHistoryForUser(userId: string, limit = 100) {
  return db.answer.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { question: { select: { id: true, statement: true, subjectId: true, unitId: true, topicId: true } } },
  });
}
