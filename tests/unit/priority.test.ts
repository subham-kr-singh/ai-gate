import { describe, expect, it } from "vitest";
import { PHASE_WEIGHTS } from "@/server/domains/planner/planner.config";
import { computePriority, computeRevisionPriority, weaknessOf } from "@/server/domains/planner/priority.service";
import { NOW, plan, studied, unit } from "./_fixtures";

describe("priority weights", () => {
  it("sum to 1 in every phase", () => {
    for (const p of [1, 2, 3, 4] as const) {
      const sum = Object.values(PHASE_WEIGHTS[p]).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });
});

describe("weakness", () => {
  it("is zero when there is no performance evidence", () => {
    expect(weaknessOf(unit())).toBe(0);
  });

  it("rises as mastery falls", () => {
    const strong = weaknessOf(studied({ mastery: 0.9, practiceAccuracy: 0.9, pyqAccuracy: 0.9 }));
    const weak = weaknessOf(studied({ mastery: 0.3, practiceAccuracy: 0.3, pyqAccuracy: 0.3 }));
    expect(weak).toBeGreaterThan(strong);
  });

  it("trusts a strong result less when it rests on few attempts", () => {
    const few = weaknessOf(studied({ mastery: 1, practiceAccuracy: 1, pyqAccuracy: 1, attempts: 1 }));
    const many = weaknessOf(studied({ mastery: 1, practiceAccuracy: 1, pyqAccuracy: 1, attempts: 40 }));
    expect(few).toBeGreaterThan(many);
  });
});

describe("computePriority", () => {
  it("stays within 0..1 and exposes contributions that sum to the score", () => {
    const r = computePriority(studied({ mistakes: 50 }), 3, NOW);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
    const sum = Object.values(r.contributions).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(r.score, 10);
  });

  it("prefers uncovered marks-heavy work in phase 1 and weak work in phase 3", () => {
    const fresh = unit({ unitId: "fresh", coverage: 0, marksShare: 0.9 });
    const weak = studied({ unitId: "weak", coverage: 0.9, mastery: 0.25, practiceAccuracy: 0.3, pyqAccuracy: 0.25, recentAccuracy: 0.2, mistakes: 9, marksShare: 0.5 });
    expect(computePriority(fresh, 1, NOW).score).toBeGreaterThan(computePriority(weak, 1, NOW).score);
    expect(computePriority(weak, 3, NOW).score).toBeGreaterThan(computePriority(fresh, 3, NOW).score);
  });

  it("is deterministic", () => {
    const s = studied();
    expect(computePriority(s, 2, NOW)).toEqual(computePriority(s, 2, NOW));
  });
});

describe("computeRevisionPriority", () => {
  it("keeps a standing obligation for units the student moved on from", () => {
    const base = { coverage: 1, mastery: 0.5, attempts: 20, revisionDueShare: 0.4, dueConceptCount: 4, avgOverdueDays: 3 };
    const moved = studied({ ...base }, { status: "MOVED_ON", unresolvedConceptIds: ["c1"] });
    const clean = studied({ ...base }, { status: "PROVISIONALLY_COMPLETE" });
    expect(computeRevisionPriority(moved, 3, NOW)).toBeGreaterThan(computeRevisionPriority(clean, 3, NOW));
  });

  it("counts an overdue revision-ladder step as urgency", () => {
    const due = studied({ coverage: 1 }, { status: "PROVISIONALLY_COMPLETE", nextRevisionAt: new Date(NOW.getTime() - 4 * 86_400_000) });
    const notDue = studied({ coverage: 1 }, { status: "PROVISIONALLY_COMPLETE", nextRevisionAt: new Date(NOW.getTime() + 4 * 86_400_000) });
    expect(computeRevisionPriority(due, 3, NOW)).toBeGreaterThan(computeRevisionPriority(notDue, 3, NOW));
    void plan;
  });
});
