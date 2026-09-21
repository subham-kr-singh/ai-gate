import { z } from "zod";

/**
 * Part 7 — AI Layer types.
 *
 * Everything the LLM produces here is a PROPOSAL. Nothing in this file
 * is authoritative learning data. The golden rule from the architecture
 * doc applies everywhere in this module:
 *
 *   LLM -> structured proposal -> Zod validation -> domain service -> DB
 *
 * Never: LLM -> direct database mutation.
 */

// ---------------------------------------------------------------------------
// Study Report extraction (chatbot fills the SAME form as the manual UI)
// ---------------------------------------------------------------------------

export const StudyReportStatus = z.enum([
  "not_started",
  "learning",
  "practicing",
  "provisionally_complete",
  "mastered",
]);

export const StudyReportDraftSchema = z.object({
  // Free-text as the user said it. Resolved to canonical syllabus IDs by
  // syllabus.service.resolveEntity() in the caller — the extractor itself
  // must not invent subject/unit IDs.
  subjectRaw: z.string().min(1),
  unitRaw: z.string().min(1),

  status: StudyReportStatus,
  topicsCovered: z.array(z.string()).default([]),
  weakTopics: z.array(z.string()).default([]),

  questionsAttempted: z.number().int().min(0).nullable(),
  questionsCorrect: z.number().int().min(0).nullable(),
  pyqsAttempted: z.number().int().min(0).nullable(),
  pyqsCorrect: z.number().int().min(0).nullable(),

  selfConfidence: z.enum(["low", "medium", "high"]).nullable(),
  continueUnit: z.boolean(),
  notes: z.string().nullable(),

  // Extraction metadata — never treated as ground truth by downstream
  // services, only surfaced to the user for confirmation.
  extractionConfidence: z.number().min(0).max(1),
  ambiguousFields: z.array(z.string()).default([]),
});
export type StudyReportDraft = z.infer<typeof StudyReportDraftSchema>;

// ---------------------------------------------------------------------------
// Mistake classification (suggestion only — one-tap tags remain user-owned)
// ---------------------------------------------------------------------------

export const MistakeTag = z.enum([
  "CONCEPTUAL_GAP",
  "CALCULATION_ERROR",
  "MISREAD",
  "FORMULA_RECALL",
  "CONFUSED_CONCEPTS",
  "CARELESS_ERROR",
  "GUESS",
  "TIME_PRESSURE",
]);

export const MistakeSuggestionSchema = z.object({
  suggestedTag: MistakeTag,
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(300),
});
export type MistakeSuggestion = z.infer<typeof MistakeSuggestionSchema>;

// ---------------------------------------------------------------------------
// Explanation (grounded, cached, non-authoritative for grading)
// ---------------------------------------------------------------------------

export const ExplanationSchema = z.object({
  explanation: z.string().min(1),
  keyConcepts: z.array(z.string()).default([]),
  groundedInTrustedSolution: z.boolean(),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

// ---------------------------------------------------------------------------
// Hints (staged — never reveal the final answer on early stages)
// ---------------------------------------------------------------------------

export const HintStage = z.enum([
  "hint_1",
  "hint_2",
  "concept_reminder",
  "final_solution",
]);

export const HintResponseSchema = z.object({
  stage: HintStage,
  content: z.string().min(1),
  revealsAnswer: z.boolean(),
});
export type HintResponse = z.infer<typeof HintResponseSchema>;

// ---------------------------------------------------------------------------
// AI usage / budget accounting (server/domains/ai/budget-guard.ts)
// ---------------------------------------------------------------------------

export interface AIUsageRecord {
  provider: string;
  model: string;
  purpose:
    | "study_report_extraction"
    | "mistake_classification"
    | "explanation"
    | "hint"
    | "eval";
  requestCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostCents: number | null;
  cacheHit: boolean;
  date: string; // YYYY-MM-DD
}
