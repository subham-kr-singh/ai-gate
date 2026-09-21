import { z } from "zod";

export const questionTypeSchema = z.enum(["MCQ", "MSQ", "NAT"]);
export const questionStatusSchema = z.enum([
  "DRAFT",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
]);

const optionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

const natToleranceSchema = z.object({
  min: z.number(),
  max: z.number(),
});

// Discriminated on `type` so correctAnswer's shape is validated per type
// at the boundary — this is the Zod gate the architecture doc requires
// before anything (AI-suggested or imported) reaches the questions table.
export const questionInputSchema = z
  .object({
    subjectId: z.string().min(1),
    unitId: z.string().min(1),
    topicId: z.string().min(1),
    conceptIds: z.array(z.string().min(1)).default([]),

    type: questionTypeSchema,
    marks: z.number().positive(),
    negativeMarks: z.number().min(0).default(0),

    statement: z.string().min(1),
    options: z.array(optionSchema).optional(),
    correctAnswer: z.union([z.string(), z.array(z.string())]),
    natTolerance: natToleranceSchema.optional(),
    solution: z.string().optional(),

    year: z.number().int().optional(),
    source: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    license: z.string().optional(),

    difficulty: z.number().int().min(1).max(5).default(3),
    status: questionStatusSchema.default("APPROVED"),
  })
  .superRefine((data, ctx) => {
    if (data.type === "MCQ") {
      if (!data.options || data.options.length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MCQ requires at least 2 options" });
      }
      if (typeof data.correctAnswer !== "string") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MCQ correctAnswer must be a single option id" });
      }
    }
    if (data.type === "MSQ") {
      if (!data.options || data.options.length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MSQ requires at least 2 options" });
      }
      if (!Array.isArray(data.correctAnswer) || data.correctAnswer.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MSQ correctAnswer must be a non-empty array of option ids" });
      }
    }
    if (data.type === "NAT") {
      if (typeof data.correctAnswer !== "string" || Number.isNaN(Number(data.correctAnswer))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NAT correctAnswer must be a numeric string" });
      }
      if (data.options) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NAT must not have options" });
      }
    }
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;

export const questionFilterSchema = z.object({
  subjectId: z.string().optional(),
  unitId: z.string().optional(),
  topicId: z.string().optional(),
  conceptId: z.string().optional(),
  type: questionTypeSchema.optional(),
  difficultyMin: z.coerce.number().int().min(1).max(5).optional(),
  difficultyMax: z.coerce.number().int().min(1).max(5).optional(),
  status: questionStatusSchema.optional().default("APPROVED"),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type QuestionFilter = z.infer<typeof questionFilterSchema>;

// Submitted answer shape, validated per question type at grading time.
export const submittedAnswerSchema = z.union([
  z.string(), // MCQ option id, or NAT numeric string
  z.array(z.string()), // MSQ option ids
  z.null(), // unanswered
]);
export type SubmittedAnswer = z.infer<typeof submittedAnswerSchema>;
