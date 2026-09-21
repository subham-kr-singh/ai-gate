import { z } from "zod";

/** Statuses a student can report. REVISION_DUE is system-derived. */
export const REPORTABLE_STATUSES = [
  "NOT_STARTED",
  "LEARNING",
  "PRACTICING",
  "PROVISIONALLY_COMPLETE",
  "MASTERED",
] as const;

const count = z.number().int().min(0).max(5000).default(0);
const ids = z.array(z.string().min(1)).max(100).default([]);

/**
 * Quick Study Report. The same schema is the target for the Part 7 chatbot's
 * extracted draft, so keep it stable.
 */
export const studyReportSchema = z
  .object({
    /** Client-generated; makes retries idempotent. */
    clientRequestId: z.string().min(8).max(100),
    unitId: z.string().min(1),
    status: z.enum(REPORTABLE_STATUSES),
    topicsCoveredIds: ids,
    weakTopicIds: ids,
    questionsAttempted: count,
    questionsCorrect: count,
    pyqAttempted: count,
    pyqCorrect: count,
    selfConfidence: z.number().int().min(1).max(4).nullable().optional(),
    continueUnit: z.boolean().default(false),
    notes: z.string().max(2000).optional(),
  })
  .refine((d) => d.questionsCorrect <= d.questionsAttempted, {
    message: "questionsCorrect cannot exceed questionsAttempted",
    path: ["questionsCorrect"],
  })
  .refine((d) => d.pyqCorrect <= d.pyqAttempted, {
    message: "pyqCorrect cannot exceed pyqAttempted",
    path: ["pyqCorrect"],
  });

export type StudyReportInput = z.output<typeof studyReportSchema>;
