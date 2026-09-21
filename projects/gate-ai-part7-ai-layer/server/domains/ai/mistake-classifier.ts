import { AIService } from "./ai.service";
import { MistakeSuggestionSchema, type MistakeSuggestion } from "./types";
import { BudgetExceededError } from "./budget-guard";

/**
 * server/domains/ai/mistake-classifier.ts
 *
 * Mistake classification is primarily user-controlled in V1 (the one-tap
 * tags built in Part 3). This module only SUGGESTS a tag to pre-select in
 * the UI — the user's tap remains the stored, authoritative value.
 *
 * Do not wire this into mistake.service.ts's write path directly. The API
 * route/UI layer is responsible for showing the suggestion and letting the
 * user confirm or override it before persisting.
 */

export interface MistakeClassificationRequest {
  questionId: string;
  statement: string;
  studentSelectedAnswer: string;
  correctAnswer: string;
  timeTakenSec: number;
  expectedTimeSec: number;
  confidenceReported: 1 | 2 | 3 | 4 | null;
}

const TAG_DEFINITIONS = `
CONCEPTUAL_GAP - didn't understand the underlying concept
CALCULATION_ERROR - understood the approach but made an arithmetic/algebraic slip
MISREAD - misread the question or options
FORMULA_RECALL - forgot or misremembered a formula/rule
CONFUSED_CONCEPTS - mixed up two similar concepts (e.g. FIFO vs LRU)
CARELESS_ERROR - knew the material, slipped due to inattention
GUESS - had no real basis for the selected answer
TIME_PRESSURE - ran out of time / rushed the final steps
`.trim();

const SYSTEM_PROMPT = `You classify why a GATE CSE/IT student got a question
wrong, using ONLY the fixed tag list provided. This is a SUGGESTION the
student will confirm or override — be honest about low confidence rather
than forcing a confident-sounding guess.`;

export async function suggestMistakeTag(
  req: MistakeClassificationRequest
): Promise<MistakeSuggestion | { unavailable: true; reason: string }> {
  const overtimeFactor = req.expectedTimeSec
    ? req.timeTakenSec / req.expectedTimeSec
    : 1;

  const prompt = `Question: ${req.statement}
Correct answer: ${req.correctAnswer}
Student selected: ${req.studentSelectedAnswer}
Time taken: ${req.timeTakenSec}s (expected ~${req.expectedTimeSec}s, ratio ${overtimeFactor.toFixed(
    2
  )})
Student's self-reported confidence: ${req.confidenceReported ?? "not given"} (1=guessed, 4=very confident)

Available tags:
${TAG_DEFINITIONS}

Pick the single most likely tag. Return JSON:
{ "suggestedTag": one of the tag names above, "confidence": 0-1, "rationale": short string }`;

  try {
    return await AIService.generateStructured({
      system: SYSTEM_PROMPT,
      prompt,
      schema: MistakeSuggestionSchema,
      purpose: "mistake_classification",
      maxTokens: 250,
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return {
        unavailable: true,
        reason: "Daily AI budget reached — tag it manually for now.",
      };
    }
    return { unavailable: true, reason: "Suggestion unavailable — tag it manually." };
  }
}
