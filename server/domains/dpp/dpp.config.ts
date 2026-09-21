/**
 * Part 4 — DPP Engine: configuration.
 *
 * Proportions are a plain object, not hard-coded into the composer, so the
 * mix can change (and be versioned) without touching selection logic. Per
 * GATE_AI_ARCHITECTURE_UPDATED_V1.md §25, exact proportions "should be
 * configurable" — this is that surface.
 */

export const DPP_SOURCES = [
  "WEAK",
  "PREREQUISITE",
  "REVISION",
  "MISTAKE",
  "PYQ",
  "MIXED",
] as const;

export type DPPSource = (typeof DPP_SOURCES)[number];

export type DPPProportions = Record<DPPSource, number>;

export interface DPPConfig {
  /** Bump whenever proportions or selection rules change materially. */
  version: string;
  /** Total questions in a generated DPP. Must equal the sum of proportions. */
  targetCount: number;
  /** How many questions each source bucket contributes, before backfill. */
  proportions: DPPProportions;
  /** Concept mastery below this counts as "weak" for the WEAK bucket. */
  weakMasteryThreshold: number;
  /** ReviewState.nextReviewAt within this many days counts as due-for-DPP. */
  revisionLookaheadDays: number;
  /** Mistakes logged within this many days are eligible for the MISTAKE bucket. */
  recentMistakeDays: number;
  /**
   * Fallback order used to fill a bucket that doesn't have enough native
   * candidates (e.g. no revision is due yet). Falls through left to right,
   * skipping questions already selected elsewhere in the DPP.
   */
  backfillOrder: DPPSource[];
}

export const DPP_CONFIG_V1: DPPConfig = {
  version: "v1",
  targetCount: 20,
  // 4 weak / 3 prerequisite / 3 revision / 3 mistake / 4 PYQ / 3 mixed,
  // per PROJECT_PLAN.md Part 4 and architecture §25.
  proportions: {
    WEAK: 4,
    PREREQUISITE: 3,
    REVISION: 3,
    MISTAKE: 3,
    PYQ: 4,
    MIXED: 3,
  },
  weakMasteryThreshold: 0.5,
  revisionLookaheadDays: 1,
  recentMistakeDays: 14,
  backfillOrder: ["MIXED", "PYQ", "WEAK", "REVISION", "PREREQUISITE", "MISTAKE"],
};

/**
 * A config whose proportions don't sum to targetCount is a configuration
 * bug, not a runtime condition to recover from — fail fast at startup /
 * import time rather than silently generating a short DPP.
 */
export function assertValidConfig(config: DPPConfig): void {
  const sum = DPP_SOURCES.reduce((total, source) => total + config.proportions[source], 0);
  if (sum !== config.targetCount) {
    throw new Error(
      `Invalid DPP config "${config.version}": proportions sum to ${sum}, ` +
        `expected targetCount ${config.targetCount}.`
    );
  }
  for (const source of DPP_SOURCES) {
    if (config.proportions[source] < 0) {
      throw new Error(`Invalid DPP config "${config.version}": ${source} proportion is negative.`);
    }
  }
  for (const source of config.backfillOrder) {
    if (!DPP_SOURCES.includes(source)) {
      throw new Error(`Invalid DPP config "${config.version}": unknown backfillOrder source "${source}".`);
    }
  }
}

assertValidConfig(DPP_CONFIG_V1);
