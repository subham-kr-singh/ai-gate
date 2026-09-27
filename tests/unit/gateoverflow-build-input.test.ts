import { describe, expect, it } from "vitest";
import { buildQuestionInput } from "@/server/domains/gateoverflow/gateoverflow.service";
import type { ParsedQuestion } from "@/server/domains/gateoverflow/gateoverflow.types";

const placement = {
  subjectId: "s-os",
  unitId: "u-pm1",
  topicId: "t-pm1",
  conceptId: "c-vmem",
};

const source = { id: "test", label: "Test", license: "personal use" };

/** Build a valid parsed MCQ fixture with field overrides for individual validation cases. */
function parsed(overrides: Partial<ParsedQuestion> = {}): ParsedQuestion {
  return {
    sourceQuestionId: "1",
    chapter: "Operating System",
    subtopic: "Virtual Memory",
    tags: [],
    year: 2019,
    statement: "What is virtual memory?",
    options: [
      { id: "A", text: "One" },
      { id: "B", text: "Two" },
      { id: "C", text: "Three" },
      { id: "D", text: "Four" },
    ],
    answer: "A",
    answerKind: "MCQ",
    sourceUrl: "https://gateoverflow.in/1",
    ...overrides,
  };
}

describe("buildQuestionInput", () => {
  it("produces a Zod-validated input carrying placement and provenance", () => {
    const result = buildQuestionInput(parsed(), placement, source);
    if ("skip" in result) throw new Error(`unexpected skip: ${result.skip}`);
    expect(result.input).toMatchObject({
      subjectId: "s-os",
      unitId: "u-pm1",
      topicId: "t-pm1",
      conceptIds: ["c-vmem"],
      type: "MCQ",
      statement: "What is virtual memory?",
      correctAnswer: "A",
      year: 2019,
      status: "APPROVED",
      license: "personal use",
    });
  });

  it("skips a question with no usable answer", () => {
    expect(buildQuestionInput(parsed({ answer: null, answerKind: "UNKNOWN" }), placement, source)).toEqual({
      skip: "missing-answer",
    });
  });

  it("skips a choice question without at least two options", () => {
    const result = buildQuestionInput(
      parsed({ options: [{ id: "A", text: "Only" }] }),
      placement,
      source
    );
    expect(result).toEqual({ skip: "missing-options" });
  });

  it("accepts a NAT answer with a tolerance band and no options", () => {
    const result = buildQuestionInput(
      parsed({ answer: "7", answerKind: "NAT", options: [], natTolerance: { min: 7, max: 9 } }),
      placement,
      source
    );
    if ("skip" in result) throw new Error(`unexpected skip: ${result.skip}`);
    expect(result.input).toMatchObject({ type: "NAT", correctAnswer: "7" });
    expect(result.input.natTolerance).toEqual({ min: 7, max: 9 });
  });

  it("skips an empty or oversized statement", () => {
    expect(buildQuestionInput(parsed({ statement: "   " }), placement, source)).toEqual({
      skip: "empty-statement",
    });
    expect(buildQuestionInput(parsed({ statement: "x".repeat(9000) }), placement, source)).toEqual({
      skip: "statement-too-long",
    });
  });

  it("drops a non-http source URL rather than failing validation", () => {
    const result = buildQuestionInput(parsed({ sourceUrl: "not-a-url" }), placement, source);
    if ("skip" in result) throw new Error(`unexpected skip: ${result.skip}`);
    expect(result.input.sourceUrl).toBeUndefined();
  });

  it("carries no concept when the subtopic did not resolve", () => {
    const result = buildQuestionInput(parsed(), { ...placement, conceptId: null }, source);
    if ("skip" in result) throw new Error(`unexpected skip: ${result.skip}`);
    expect(result.input.conceptIds).toEqual([]);
  });
});
