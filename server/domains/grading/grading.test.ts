import { describe, expect, it } from "vitest";
import { gradeAnswer, type GradableQuestion } from "./grading.service";
import type { MarkingRule } from "./marking-scheme";

const mcqRule: MarkingRule = { negativeMarksFraction: 1 / 3, allowsPartialMarking: false };
const msqRuleNoPartial: MarkingRule = { negativeMarksFraction: 0, allowsPartialMarking: false };
const msqRulePartial: MarkingRule = { negativeMarksFraction: 0, allowsPartialMarking: true };
const natRule: MarkingRule = { negativeMarksFraction: 0, allowsPartialMarking: false };

describe("MCQ grading", () => {
  const q: GradableQuestion = { type: "MCQ", marks: 1, correctAnswer: "b" };

  it("awards full marks for the correct option", () => {
    expect(gradeAnswer(q, "b", mcqRule)).toEqual({ correct: true, marks: 1 });
  });

  it("applies negative marking for an incorrect option", () => {
    const result = gradeAnswer(q, "a", mcqRule);
    expect(result.correct).toBe(false);
    expect(result.marks).toBeCloseTo(-1 / 3);
  });

  it("awards zero marks and is not correct when unanswered", () => {
    expect(gradeAnswer(q, null, mcqRule)).toEqual({ correct: false, marks: 0 });
    expect(gradeAnswer(q, undefined, mcqRule)).toEqual({ correct: false, marks: 0 });
  });

  it("scales negative marking with question.marks for 2-mark questions", () => {
    const twoMarkQ: GradableQuestion = { type: "MCQ", marks: 2, correctAnswer: "b" };
    const result = gradeAnswer(twoMarkQ, "a", mcqRule);
    expect(result.marks).toBeCloseTo(-2 / 3);
  });
});

describe("MSQ grading", () => {
  const q: GradableQuestion = { type: "MSQ", marks: 2, correctAnswer: ["a", "c"] };

  it("awards full marks for the exact correct set", () => {
    expect(gradeAnswer(q, ["a", "c"], msqRuleNoPartial)).toEqual({ correct: true, marks: 2 });
    expect(gradeAnswer(q, ["c", "a"], msqRuleNoPartial)).toEqual({ correct: true, marks: 2 }); // order-independent
  });

  it("gives zero marks for an incorrect answer with no partial-marking policy", () => {
    expect(gradeAnswer(q, ["a"], msqRuleNoPartial)).toEqual({ correct: false, marks: 0 });
  });

  it("gives partial credit for a correct subset under a partial-marking policy", () => {
    const result = gradeAnswer(q, ["a"], msqRulePartial);
    expect(result.correct).toBe(false);
    expect(result.marks).toBeCloseTo(1); // 1 of 2 correct options × 2 marks / 2
  });

  it("gives zero (not negative) marks when any wrong option is selected, even under partial-marking", () => {
    const result = gradeAnswer(q, ["a", "b"], msqRulePartial);
    expect(result.correct).toBe(false);
    expect(result.marks).toBe(0);
  });

  it("is unanswered when nothing is selected", () => {
    expect(gradeAnswer(q, [], msqRuleNoPartial)).toEqual({ correct: false, marks: 0 });
    expect(gradeAnswer(q, null, msqRuleNoPartial)).toEqual({ correct: false, marks: 0 });
  });
});

describe("NAT grading", () => {
  const qWithTolerance: GradableQuestion = {
    type: "NAT",
    marks: 2,
    correctAnswer: "5",
    natTolerance: { min: 4.9, max: 5.1 },
  };
  const qExact: GradableQuestion = { type: "NAT", marks: 1, correctAnswer: "42" };

  it("accepts a value within the tolerance band", () => {
    expect(gradeAnswer(qWithTolerance, "5.02", natRule)).toEqual({ correct: true, marks: 2 });
  });

  it("rejects a value outside the tolerance band", () => {
    const result = gradeAnswer(qWithTolerance, "5.5", natRule);
    expect(result.correct).toBe(false);
    expect(result.marks).toBe(0);
  });

  it("falls back to exact match when no tolerance is configured", () => {
    expect(gradeAnswer(qExact, "42", natRule)).toEqual({ correct: true, marks: 1 });
    expect(gradeAnswer(qExact, "42.01", natRule)).toEqual({ correct: false, marks: 0 });
  });

  it("treats a non-numeric submission as unanswered/incorrect, not a crash", () => {
    expect(gradeAnswer(qExact, "abc", natRule)).toEqual({ correct: false, marks: 0 });
  });

  it("is unanswered when nothing is submitted", () => {
    expect(gradeAnswer(qExact, null, natRule)).toEqual({ correct: false, marks: 0 });
    expect(gradeAnswer(qExact, "", natRule)).toEqual({ correct: false, marks: 0 });
  });
});
