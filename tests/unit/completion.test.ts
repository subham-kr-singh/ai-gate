import { describe, expect, it } from "vitest";
import { evaluateUnitCompletion, type UnitEvidence } from "../../server/domains/mastery/completion.service";
import { DEFAULT_COMPLETION_CONFIG } from "../../server/domains/mastery/completion.config";

const base: UnitEvidence = {
  conceptCount: 10,
  coverage: 1,
  mastery: 0.62,
  evidence: 18,
  practiceAccuracy: 0.58,
  practiceEvidence: 12,
  pyqAccuracy: 0.45,
  pyqEvidence: 6,
  recentAccuracy: 0.5,
  retention: 0.6,
  openMistakes: 6,
  prerequisiteGaps: 0,
  selfReportedContinue: false,
};

const strong: UnitEvidence = {
  ...base,
  mastery: 0.95,
  practiceAccuracy: 0.92,
  pyqAccuracy: 0.9,
  recentAccuracy: 0.93,
  retention: 0.9,
  openMistakes: 0,
};

describe("evaluateUnitCompletion", () => {
  it("NOT_STARTED with no activity", () => {
    const r = evaluateUnitCompletion({ ...base, coverage: 0, evidence: 0, mastery: 0 });
    expect(r.status).toBe("NOT_STARTED");
    expect(r.readiness).toBeNull();
    expect(r.decision).toBe("CONTINUE");
  });

  it("weak evidence (architecture example) keeps the unit open", () => {
    const r = evaluateUnitCompletion(base);
    expect(r.status).toBe("PRACTICING");
    expect(r.decision).toBe("CONTINUE");
    const types = r.reasons.map((x) => x.type);
    expect(types).toContain("LOW_PRACTICE_ACCURACY");
    expect(types).toContain("LOW_PYQ_ACCURACY");
    expect(types).toContain("OPEN_MISTAKES");
  });

  it("low coverage is LEARNING even with good accuracy", () => {
    const r = evaluateUnitCompletion({ ...strong, coverage: 0.4 });
    expect(r.status).toBe("LEARNING");
    expect(r.decision).toBe("CONTINUE");
  });

  it("too little evidence is PRACTICING, however good it looks", () => {
    const r = evaluateUnitCompletion({ ...strong, evidence: 3 });
    expect(r.status).toBe("PRACTICING");
    expect(r.reasons.map((x) => x.type)).toContain("INSUFFICIENT_EVIDENCE");
  });

  it("strong evidence with a couple of open mistakes is provisionally complete", () => {
    const r = evaluateUnitCompletion({ ...strong, mastery: 0.9, practiceAccuracy: 0.87, pyqAccuracy: 0.82, recentAccuracy: 0.88, openMistakes: 2 });
    expect(r.status).toBe("PROVISIONALLY_COMPLETE");
    expect(r.decision).toBe("MOVE_ON");
  });

  it("very strong evidence with no gaps is MASTERED", () => {
    expect(evaluateUnitCompletion(strong).status).toBe("MASTERED");
  });

  it("a prerequisite gap blocks MASTERED", () => {
    expect(evaluateUnitCompletion({ ...strong, prerequisiteGaps: 1 }).status).toBe("PROVISIONALLY_COMPLETE");
  });

  it("complete-looking units with fading retention become REVISION_DUE", () => {
    const r = evaluateUnitCompletion({ ...strong, retention: 0.3 });
    expect(r.status).toBe("REVISION_DUE");
    expect(r.decision).toBe("MOVE_ON");
  });

  it("respects the student's wish to continue without changing the evidence status", () => {
    const r = evaluateUnitCompletion({ ...strong, selfReportedContinue: true });
    expect(r.status).toBe("MASTERED");
    expect(r.decision).toBe("CONTINUE");
    expect(r.reasons.map((x) => x.type)).toContain("USER_WANTS_TO_CONTINUE");
  });

  it("ignores components without enough evidence instead of counting them as zero", () => {
    const withPyq = evaluateUnitCompletion({ ...strong, pyqAccuracy: 0.1, pyqEvidence: 1 });
    expect(withPyq.status).toBe("MASTERED");
  });

  it("thresholds are configurable per phase", () => {
    const borderline: UnitEvidence = {
      ...strong, mastery: 0.68, practiceAccuracy: 0.68, pyqAccuracy: 0.68, recentAccuracy: 0.68, openMistakes: 0,
    };
    expect(evaluateUnitCompletion(borderline).status).toBe("PRACTICING");
    const cfg = { ...DEFAULT_COMPLETION_CONFIG, phaseCutAdjustment: { 1: 0, 2: 0, 3: -0.05, 4: 0 } as const };
    expect(evaluateUnitCompletion(borderline, cfg, { phase: 3 }).status).toBe("PROVISIONALLY_COMPLETE");
  });

  it("is deterministic and versioned", () => {
    expect(evaluateUnitCompletion(base)).toEqual(evaluateUnitCompletion(base));
    expect(evaluateUnitCompletion(base).version).toBe("v1");
  });
});
