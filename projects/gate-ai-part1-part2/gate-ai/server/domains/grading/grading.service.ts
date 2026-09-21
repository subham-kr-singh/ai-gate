import type { MarkingRule } from "./marking-scheme";

export type GradableQuestion = {
  type: "MCQ" | "MSQ" | "NAT";
  marks: number;
  correctAnswer: unknown; // string | string[] — validated shape per type
  natTolerance?: { min: number; max: number } | null;
};

export type SubmittedAnswer = string | string[] | null | undefined;

export interface GradingResult {
  correct: boolean;
  marks: number;
}

/** The GATE grading engine. Pure function — no I/O, no LLM, fully unit
 * testable. This is the single place "answer correctness" and "marks"
 * are decided; nothing else in the codebase should compute a score
 * (architecture §3 "Golden rule", §21 "GATE Grading Engine"). */
export function gradeAnswer(
  question: GradableQuestion,
  submitted: SubmittedAnswer,
  rule: MarkingRule
): GradingResult {
  if (submitted === null || submitted === undefined) {
    return { correct: false, marks: 0 };
  }

  switch (question.type) {
    case "MCQ":
      return gradeMCQ(question, submitted, rule);
    case "MSQ":
      return gradeMSQ(question, submitted, rule);
    case "NAT":
      return gradeNAT(question, submitted, rule);
    default: {
      const _exhaustive: never = question.type;
      throw new Error(`Unknown question type: ${_exhaustive}`);
    }
  }
}

function gradeMCQ(
  question: GradableQuestion,
  submitted: SubmittedAnswer,
  rule: MarkingRule
): GradingResult {
  if (typeof submitted !== "string" || submitted.length === 0) {
    return { correct: false, marks: 0 };
  }
  const correctId = question.correctAnswer as string;
  if (submitted === correctId) {
    return { correct: true, marks: question.marks };
  }
  return { correct: false, marks: negativePenalty(question.marks, rule.negativeMarksFraction) };
}

function gradeMSQ(
  question: GradableQuestion,
  submitted: SubmittedAnswer,
  rule: MarkingRule
): GradingResult {
  if (!Array.isArray(submitted) || submitted.length === 0) {
    return { correct: false, marks: 0 };
  }
  const correctSet = new Set(question.correctAnswer as string[]);
  const selected = new Set(submitted);

  const hasWrongSelection = [...selected].some((id) => !correctSet.has(id));
  if (hasWrongSelection) {
    // GATE MSQ: any incorrect option selected → zero for the question,
    // regardless of partial-marking policy.
    return { correct: false, marks: negativePenalty(question.marks, rule.negativeMarksFraction) };
  }

  const isExactMatch =
    selected.size === correctSet.size &&
    [...correctSet].every((id) => selected.has(id));

  if (isExactMatch) {
    return { correct: true, marks: question.marks };
  }

  if (rule.allowsPartialMarking && correctSet.size > 0) {
    const partial = (selected.size / correctSet.size) * question.marks;
    return { correct: false, marks: partial };
  }

  // Correct-only-partial selection, but this exam year's scheme doesn't
  // award partial credit — treat as incorrect, no marks either way.
  return { correct: false, marks: 0 };
}

function gradeNAT(
  question: GradableQuestion,
  submitted: SubmittedAnswer,
  rule: MarkingRule
): GradingResult {
  if (typeof submitted !== "string" || submitted.trim().length === 0) {
    return { correct: false, marks: 0 };
  }
  const value = Number(submitted);
  if (Number.isNaN(value)) {
    return { correct: false, marks: 0 };
  }

  const tolerance = question.natTolerance;
  let inRange: boolean;
  if (tolerance) {
    inRange = value >= tolerance.min && value <= tolerance.max;
  } else {
    const target = Number(question.correctAnswer as string);
    inRange = Math.abs(value - target) < 1e-9;
  }

  if (inRange) {
    return { correct: true, marks: question.marks };
  }
  return { correct: false, marks: negativePenalty(question.marks, rule.negativeMarksFraction) };
}

/** Avoids returning -0 (which fails strict-equality/toEqual test
 * assertions and can render as "-0" in the UI) when the negative-marking
 * fraction is zero. */
function negativePenalty(marks: number, negativeMarksFraction: number): number {
  const penalty = marks * negativeMarksFraction;
  return penalty === 0 ? 0 : -penalty;
}
