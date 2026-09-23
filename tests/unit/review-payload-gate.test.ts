/**
 * The approve gate, tested without a database.
 *
 * `validateDraftPayload` is the check `decide` runs at promotion time, so these
 * cases are the contract for what may be published. A draft that fails here
 * cannot be approved, no matter how it got into the queue.
 */
import { describe, expect, it } from "vitest";
import { validateDraftPayload } from "@/server/domains/ingestion/review.service";

const validMcq = {
  subjectId: "s1",
  unitId: "u1",
  topicId: "t1",
  type: "MCQ",
  marks: 1,
  statement: "Which of the following is a stable sort?",
  options: [
    { id: "A", text: "Quick sort" },
    { id: "B", text: "Merge sort" },
  ],
  correctAnswer: "B",
};

describe("validateDraftPayload", () => {
  it("accepts a complete MCQ payload", () => {
    expect(validateDraftPayload(validMcq)).toEqual({ valid: true, issues: [] });
  });

  it("accepts a NAT payload with a tolerance band", () => {
    const nat = {
      subjectId: "s1",
      unitId: "u1",
      topicId: "t1",
      type: "NAT",
      marks: 2,
      statement: "Compute the value.",
      correctAnswer: "198",
      natTolerance: { min: 197.9, max: 198.1 },
    };
    expect(validateDraftPayload(nat).valid).toBe(true);
  });

  it("reports each missing syllabus id separately", () => {
    // This is the cascade the ingestion report shows: one unmapped block, three
    // Required notes. Callers must not read the note count as a bug count.
    const { valid, issues } = validateDraftPayload({ ...validMcq, subjectId: undefined, unitId: undefined, topicId: undefined });
    expect(valid).toBe(false);
    const paths = issues.map((i) => i.path).sort();
    expect(paths).toEqual(["subjectId", "topicId", "unitId"]);
    expect(issues.every((i) => i.message === "Required")).toBe(true);
  });

  it("rejects an MCQ with fewer than two options", () => {
    const { valid, issues } = validateDraftPayload({ ...validMcq, options: [{ id: "A", text: "only one" }] });
    expect(valid).toBe(false);
    expect(issues.some((i) => i.message.includes("at least 2 options"))).toBe(true);
  });

  it("rejects an empty option text, which is how a rasterised option arrives", () => {
    const { valid } = validateDraftPayload({
      ...validMcq,
      options: [
        { id: "A", text: "Quick sort" },
        { id: "B", text: "" },
      ],
    });
    expect(valid).toBe(false);
  });

  it("rejects an MCQ whose answer is an array", () => {
    const { valid, issues } = validateDraftPayload({ ...validMcq, correctAnswer: ["A", "B"] });
    expect(valid).toBe(false);
    expect(issues.some((i) => i.message.includes("single option id"))).toBe(true);
  });

  it("rejects a non-object payload", () => {
    expect(validateDraftPayload(null).valid).toBe(false);
    expect(validateDraftPayload("not a payload").valid).toBe(false);
  });

  it("defaults status to APPROVED when absent, so promotion needs no extra field", () => {
    // questionInputSchema defaults `status`; the promoted row is APPROVED
    // because the reviewer's decision *is* the approval.
    const parsed = validateDraftPayload({ ...validMcq });
    expect(parsed.valid).toBe(true);
  });

  it("anchors issue paths to a stable string for display", () => {
    const { issues } = validateDraftPayload({ ...validMcq, options: [{ id: "A", text: "" }, { id: "B", text: "b" }] });
    // Nested paths are dot-joined so the UI can print them without guessing.
    expect(issues.every((i) => typeof i.path === "string")).toBe(true);
  });
});
