import { describe, expect, it } from "vitest";
import { studyReportSchema } from "../../server/domains/mastery/study-report.schema";

const ok = { clientRequestId: "req-12345678", unitId: "u1", status: "PRACTICING" as const };

describe("studyReportSchema", () => {
  it("applies defaults", () => {
    const r = studyReportSchema.parse(ok);
    expect(r.questionsAttempted).toBe(0);
    expect(r.topicsCoveredIds).toEqual([]);
    expect(r.continueUnit).toBe(false);
  });
  it("rejects correct > attempted", () => {
    expect(studyReportSchema.safeParse({ ...ok, questionsAttempted: 5, questionsCorrect: 6 }).success).toBe(false);
    expect(studyReportSchema.safeParse({ ...ok, pyqAttempted: 1, pyqCorrect: 2 }).success).toBe(false);
  });
  it("does not let the student report REVISION_DUE", () => {
    expect(studyReportSchema.safeParse({ ...ok, status: "REVISION_DUE" }).success).toBe(false);
  });
  it("accepts the Computer Networks example from the architecture doc", () => {
    const r = studyReportSchema.safeParse({ ...ok, questionsAttempted: 20, questionsCorrect: 14, continueUnit: true, selfConfidence: 3 });
    expect(r.success).toBe(true);
  });
});
