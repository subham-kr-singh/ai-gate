import { db } from "@/server/db/client";
import type { QuestionType } from "@prisma/client";

export interface MarkingRule {
  negativeMarksFraction: number;
  allowsPartialMarking: boolean;
}

/** Looks up the marking rule for (examYear, questionType). Grading must
 * never fall back to a hard-coded default silently — if a scheme is
 * missing, that's a data problem the caller should surface, not paper
 * over (architecture §21: "Never use an LLM for final marks... the
 * server is authoritative", which implies the server must have real
 * configured rules, not guesses). */
export async function getMarkingRule(
  examYear: number,
  questionType: QuestionType
): Promise<MarkingRule> {
  const scheme = await db.markingScheme.findUnique({
    where: { examYear_questionType: { examYear, questionType } },
  });
  if (!scheme) {
    throw new Error(
      `No MarkingScheme configured for examYear=${examYear} type=${questionType}. Seed one before grading.`
    );
  }
  return {
    negativeMarksFraction: scheme.negativeMarksFraction,
    allowsPartialMarking: scheme.allowsPartialMarking,
  };
}
