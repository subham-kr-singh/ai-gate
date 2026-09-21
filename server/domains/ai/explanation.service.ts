import { AIService } from "./ai.service";
import { ExplanationSchema, type Explanation } from "./types";
import { BudgetExceededError } from "./budget-guard";

/**
 * server/domains/ai/explanation.service.ts
 *
 * Pipeline (architecture doc §44 "AI Explanation Pipeline"):
 *
 *   Wrong attempt -> Question -> Trusted solution -> Relevant concepts
 *   -> Student mistake history -> LLM -> Explanation -> Cache/store
 *
 * The explanation is advisory content, never authoritative for grading.
 * Cached by (questionId, algorithmVersion) so repeat wrong attempts on
 * the same question don't re-spend budget.
 */

export interface ExplanationRequest {
  questionId: string;
  statement: string;
  trustedSolution: string;
  relevantConcepts: string[];
  studentSelectedAnswer: string;
  correctAnswer: string;
  recentMistakeTypes: string[]; // e.g. ["CONCEPTUAL_GAP", "MISREAD"]
}

export interface ExplanationCache {
  get(questionId: string): Promise<Explanation | null>;
  set(questionId: string, explanation: Explanation): Promise<void>;
}

// Swap for a Prisma-backed cache (AIOutput table, keyed on questionId +
// contentHash) before production. In-memory here keeps this file testable
// without a database.
class InMemoryExplanationCache implements ExplanationCache {
  private store = new Map<string, Explanation>();
  async get(questionId: string) {
    return this.store.get(questionId) ?? null;
  }
  async set(questionId: string, explanation: Explanation) {
    this.store.set(questionId, explanation);
  }
}

export const defaultExplanationCache = new InMemoryExplanationCache();

const SYSTEM_PROMPT = `You are a GATE CSE/IT tutor explaining why a student's
answer was wrong. Ground your explanation strictly in the trusted solution
provided — never introduce facts not supported by it. Be concise (4-8
sentences). Reference the student's recent mistake pattern only if it is
directly relevant to this question.`;

export async function getExplanation(
  req: ExplanationRequest,
  cache: ExplanationCache = defaultExplanationCache
): Promise<Explanation | { unavailable: true; reason: string }> {
  const cached = await cache.get(req.questionId);
  if (cached) return cached;

  const prompt = `Question:
${req.statement}

Trusted solution:
${req.trustedSolution}

Relevant concepts: ${req.relevantConcepts.join(", ") || "none listed"}
Student selected: ${req.studentSelectedAnswer}
Correct answer: ${req.correctAnswer}
Student's recent mistake pattern: ${
    req.recentMistakeTypes.join(", ") || "none on file"
  }

Explain why the student's answer is wrong and what the correct reasoning
is. Return JSON: { "explanation": string, "keyConcepts": string[],
"groundedInTrustedSolution": boolean }`;

  try {
    const result = await AIService.generateStructured({
      system: SYSTEM_PROMPT,
      prompt,
      schema: ExplanationSchema,
      purpose: "explanation",
    });
    await cache.set(req.questionId, result);
    return result;
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return {
        unavailable: true,
        reason:
          "Daily AI budget reached. Use the trusted solution text directly; explanations resume tomorrow.",
      };
    }
    return {
      unavailable: true,
      reason: "Explanation generation failed. The trusted solution is still available.",
    };
  }
}
