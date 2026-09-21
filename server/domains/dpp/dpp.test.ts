import { describe, expect, it } from "vitest";
import { assertValidConfig, DPP_CONFIG_V1, type DPPConfig } from "./dpp.config";
import { composeDPP } from "./dpp.compose";
import type { DPPCandidatePool, DPPCandidateQuestion } from "./dpp.types";

/** Builds `count` distinct fake candidates, all belonging to `conceptId`, prefixed for readability in failures. */
function candidates(prefix: string, count: number, conceptId: string | null = null): DPPCandidateQuestion[] {
  return Array.from({ length: count }, (_, i) => ({
    questionId: `${prefix}-${i + 1}`,
    conceptId,
  }));
}

/** A pool with plenty of candidates in every bucket — the "happy path" case. */
function abundantPool(): DPPCandidatePool {
  return {
    WEAK: candidates("weak", 10, "concept-weak"),
    PREREQUISITE: candidates("prereq", 10, "concept-prereq"),
    REVISION: candidates("revision", 10, "concept-revision"),
    MISTAKE: candidates("mistake", 10, "concept-mistake"),
    PYQ: candidates("pyq", 10),
    MIXED: candidates("mixed", 20),
  };
}

describe("dpp.config", () => {
  it("the shipped v1 config has proportions that sum to targetCount", () => {
    expect(() => assertValidConfig(DPP_CONFIG_V1)).not.toThrow();
  });

  it("rejects a config whose proportions don't sum to targetCount", () => {
    const bad: DPPConfig = {
      ...DPP_CONFIG_V1,
      proportions: { ...DPP_CONFIG_V1.proportions, WEAK: 999 },
    };
    expect(() => assertValidConfig(bad)).toThrow(/proportions sum to/);
  });

  it("rejects a negative proportion even when the sum still matches targetCount", () => {
    const bad: DPPConfig = {
      ...DPP_CONFIG_V1,
      // Sums to 20 (= targetCount) despite the negative MISTAKE value, so
      // only the dedicated negative-value check can catch this.
      proportions: { WEAK: 4, PREREQUISITE: 3, REVISION: 3, MISTAKE: -3, PYQ: 4, MIXED: 9 },
    };
    expect(() => assertValidConfig(bad)).toThrow(/negative/);
  });
});

describe("composeDPP — proportions", () => {
  it("fills exactly targetCount questions when every bucket has enough candidates", () => {
    const result = composeDPP(abundantPool(), DPP_CONFIG_V1);
    expect(result.questions).toHaveLength(DPP_CONFIG_V1.targetCount);
    expect(result.fullyFilled).toBe(true);
    expect(result.shortfall).toBe(0);
  });

  it("honors each source's configured quota when candidates are abundant", () => {
    const result = composeDPP(abundantPool(), DPP_CONFIG_V1);
    const countBySource = Object.fromEntries(
      Object.entries(DPP_CONFIG_V1.proportions).map(([source]) => [
        source,
        result.questions.filter((q) => q.source === source).length,
      ])
    );
    expect(countBySource).toEqual(DPP_CONFIG_V1.proportions);
  });

  it("assigns contiguous 1-based positions with no gaps or repeats", () => {
    const result = composeDPP(abundantPool(), DPP_CONFIG_V1);
    const positions = result.questions.map((q) => q.position).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: DPP_CONFIG_V1.targetCount }, (_, i) => i + 1));
  });
});

describe("composeDPP — no duplicates", () => {
  it("never places the same question twice, even if it appears in multiple buckets", () => {
    // "shared-1..3" are surfaced by both WEAK and REVISION, as would happen
    // for a weak concept that's also due for review.
    const shared = candidates("shared", 3, "concept-weak");
    const pool: DPPCandidatePool = {
      ...abundantPool(),
      WEAK: [...shared, ...candidates("weak-only", 10, "concept-weak")],
      REVISION: [...shared, ...candidates("revision-only", 10, "concept-revision")],
    };
    const result = composeDPP(pool, DPP_CONFIG_V1);
    const ids = result.questions.map((q) => q.questionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("dedupes across the entire pool even under heavy overlap", () => {
    const onlyPool = candidates("only", 5); // every bucket shares this same tiny pool
    const pool: DPPCandidatePool = {
      WEAK: onlyPool,
      PREREQUISITE: onlyPool,
      REVISION: onlyPool,
      MISTAKE: onlyPool,
      PYQ: onlyPool,
      MIXED: onlyPool,
    };
    const result = composeDPP(pool, DPP_CONFIG_V1);
    const ids = result.questions.map((q) => q.questionId);
    expect(new Set(ids).size).toBe(ids.length);
    // Only 5 unique questions exist across all buckets combined.
    expect(result.questions.length).toBeLessThanOrEqual(5);
    expect(result.fullyFilled).toBe(false);
    expect(result.shortfall).toBe(DPP_CONFIG_V1.targetCount - result.questions.length);
  });
});

describe("composeDPP — backfill", () => {
  it("fills a bucket's shortfall from config.backfillOrder rather than leaving slots empty", () => {
    const pool: DPPCandidatePool = {
      ...abundantPool(),
      REVISION: [], // nothing due for review today — a common, expected case
    };
    const result = composeDPP(pool, DPP_CONFIG_V1);
    expect(result.questions).toHaveLength(DPP_CONFIG_V1.targetCount);
    expect(result.fullyFilled).toBe(true); // backfilled, so the set is still complete
    expect(result.questions.some((q) => q.questionId.startsWith("revision-"))).toBe(false);
  });

  it("tags backfilled questions as MIXED rather than misattributing them to the short bucket", () => {
    const pool: DPPCandidatePool = { ...abundantPool(), MISTAKE: [] };
    const result = composeDPP(pool, DPP_CONFIG_V1);
    const fromMistakeBucket = result.questions.filter((q) => q.questionId.startsWith("mistake-"));
    expect(fromMistakeBucket).toHaveLength(0);
    // The 3 slots that would have been MISTAKE are now MIXED-sourced instead.
    const mixedCount = result.questions.filter((q) => q.source === "MIXED").length;
    expect(mixedCount).toBeGreaterThanOrEqual(DPP_CONFIG_V1.proportions.MIXED + DPP_CONFIG_V1.proportions.MISTAKE);
  });

  it("reports an honest shortfall when even the backfill sources run dry", () => {
    const pool: DPPCandidatePool = {
      WEAK: candidates("weak", 4, "c1"),
      PREREQUISITE: candidates("prereq", 3, "c2"),
      REVISION: [],
      MISTAKE: [],
      PYQ: [],
      MIXED: [], // no reserve to backfill from either
    };
    const result = composeDPP(pool, DPP_CONFIG_V1);
    expect(result.questions).toHaveLength(7); // 4 + 3, all that's available
    expect(result.fullyFilled).toBe(false);
    expect(result.shortfall).toBe(DPP_CONFIG_V1.targetCount - 7);
  });

  it("is a no-op when every bucket exactly meets its quota (no backfill needed, no waste)", () => {
    const pool: DPPCandidatePool = {
      WEAK: candidates("weak", DPP_CONFIG_V1.proportions.WEAK, "c1"),
      PREREQUISITE: candidates("prereq", DPP_CONFIG_V1.proportions.PREREQUISITE, "c2"),
      REVISION: candidates("revision", DPP_CONFIG_V1.proportions.REVISION, "c3"),
      MISTAKE: candidates("mistake", DPP_CONFIG_V1.proportions.MISTAKE, "c4"),
      PYQ: candidates("pyq", DPP_CONFIG_V1.proportions.PYQ),
      MIXED: candidates("mixed", DPP_CONFIG_V1.proportions.MIXED),
    };
    const result = composeDPP(pool, DPP_CONFIG_V1);
    expect(result.questions).toHaveLength(DPP_CONFIG_V1.targetCount);
    expect(result.questions.filter((q) => q.source === "MIXED")).toHaveLength(
      DPP_CONFIG_V1.proportions.MIXED
    );
  });
});
