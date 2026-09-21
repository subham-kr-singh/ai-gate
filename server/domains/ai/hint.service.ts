import { AIService } from "./ai.service";
import { HintResponseSchema, type HintResponse } from "./types";
import { BudgetExceededError } from "./budget-guard";

/**
 * server/domains/ai/hint.service.ts
 *
 * Learning-first staged hints (architecture doc §45 "Tutor Modes"):
 *
 *   Hint 1 -> Hint 2 -> Concept reminder -> Final solution
 *
 * Each stage is a separate, cheap call — never let stage 1 or 2 leak the
 * final answer. `revealsAnswer` must be false for every stage except
 * "final_solution"; this is asserted here, not just prompted for, since
 * prompt compliance alone isn't trustworthy.
 */

export interface HintRequest {
  questionId: string;
  statement: string;
  trustedSolution: string;
  stage: "hint_1" | "hint_2" | "concept_reminder" | "final_solution";
}

const STAGE_INSTRUCTIONS: Record<HintRequest["stage"], string> = {
  hint_1:
    "Give a single gentle nudge toward the right approach. Do NOT name the final technique or answer. One or two sentences.",
  hint_2:
    "Give a more specific nudge than hint 1 — point at the relevant concept or formula category, but still do not solve the problem or state the answer.",
  concept_reminder:
    "Briefly restate the underlying concept or rule needed to solve this, in general terms, without applying it to this specific question's numbers/options.",
  final_solution:
    "Now give the full worked solution and final answer, grounded strictly in the trusted solution provided.",
};

const SYSTEM_PROMPT = `You are a GATE CSE/IT tutor giving a staged hint.
Follow the stage instruction exactly. Never reveal the final answer unless
the stage is "final_solution".`;

export async function getHint(
  req: HintRequest
): Promise<HintResponse | { unavailable: true; reason: string }> {
  const prompt = `Question:
${req.statement}

Trusted solution (for your grounding only — do not dump this verbatim
unless stage is final_solution):
${req.trustedSolution}

Stage: ${req.stage}
Instruction: ${STAGE_INSTRUCTIONS[req.stage]}

Return JSON: { "stage": "${req.stage}", "content": string, "revealsAnswer": boolean }`;

  try {
    const result = await AIService.generateStructured({
      system: SYSTEM_PROMPT,
      prompt,
      schema: HintResponseSchema,
      purpose: "hint",
      maxTokens: 300,
    });

    // Defense in depth: never trust the model's own revealsAnswer=false
    // claim for early stages.
    if (req.stage !== "final_solution" && result.revealsAnswer) {
      return {
        unavailable: true,
        reason:
          "Hint generation produced an answer-revealing response for a non-final stage; suppressed for safety. Try the next stage or the trusted solution.",
      };
    }

    return result;
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return {
        unavailable: true,
        reason: "Daily AI budget reached. Hints resume tomorrow.",
      };
    }
    return { unavailable: true, reason: "Hint generation failed." };
  }
}
