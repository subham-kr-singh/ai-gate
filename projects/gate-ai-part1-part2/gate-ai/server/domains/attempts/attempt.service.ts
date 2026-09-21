import * as repo from "./attempt.repository";
import type { SubmittedAnswer } from "@/server/domains/grading/grading.service";
import type { Prisma } from "@prisma/client";

export async function recordAttempt(params: {
  userId: string;
  testId: string;
  totalMarks: number;
  scoredMarks: number;
  accuracy: number;
  answers: Array<{
    questionId: string;
    selectedAnswer: SubmittedAnswer;
    correct: boolean;
    marks: number;
    timeTakenMs?: number;
    confidence?: number;
    markedForReview?: boolean;
  }>;
}) {
  return repo.createAttemptWithAnswers({
    ...params,
    answers: params.answers.map((a) => ({
      ...a,
      selectedAnswer: (a.selectedAnswer ?? null) as Prisma.InputJsonValue,
    })),
  });
}

export async function getAttemptHistory(userId: string) {
  return repo.findAttemptHistoryForUser(userId);
}
