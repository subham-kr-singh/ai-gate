export interface DraftAnswerEntry {
  seq: number;
  selectedAnswer: string | string[] | null;
  confidence?: number; // 1–4
  markedForReview?: boolean;
  timeTakenMs?: number;
  updatedAt: string; // ISO
}

export type DraftAnswers = Record<string, DraftAnswerEntry>; // questionId -> entry

export interface SubmitResult {
  testId: string;
  attemptId: string;
  totalMarks: number;
  scoredMarks: number;
  accuracy: number;
  perQuestion: Array<{
    questionId: string;
    correct: boolean;
    marks: number;
  }>;
}
