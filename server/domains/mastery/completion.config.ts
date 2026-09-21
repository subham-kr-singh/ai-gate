/**
 * Unit-completion configuration.
 *
 * Every number here is a starting point to be calibrated against fresh-question
 * and mock outcomes - not an established threshold. Bump COMPLETION_VERSION
 * when the formula or cut-points change.
 */
export const COMPLETION_VERSION = "v1";

export interface CompletionConfig {
  /** Mean concept completion needed before a unit can be practising/complete. */
  minCoverage: number;
  /** Weighted question count needed before a unit can leave LEARNING/PRACTICING. */
  minEvidence: number;
  /** A practice/PYQ component only counts once it has this much evidence. */
  minComponentEvidence: number;
  weights: { mastery: number; practice: number; pyq: number; recent: number };
  penalties: {
    perOpenMistake: number;
    maxOpenMistakes: number;
    perPrerequisiteGap: number;
    maxPrerequisiteGaps: number;
  };
  provisionalCut: number;
  masteredCut: number;
  masteredMaxOpenMistakes: number;
  /** Complete-ish units whose average retention falls below this become REVISION_DUE. */
  revisionDueRetention: number;
  /** A component below this is reported as a weakness reason. */
  weakBelow: number;
  /** A prerequisite concept below this mastery counts as a gap. */
  prerequisiteWeakBelow: number;
  /** Added to both cuts per preparation phase (negative = more lenient). */
  phaseCutAdjustment: Record<1 | 2 | 3 | 4, number>;
}

export const DEFAULT_COMPLETION_CONFIG: CompletionConfig = {
  minCoverage: 0.8,
  minEvidence: 8,
  minComponentEvidence: 3,
  weights: { mastery: 0.35, practice: 0.25, pyq: 0.25, recent: 0.15 },
  penalties: {
    perOpenMistake: 0.02,
    maxOpenMistakes: 0.15,
    perPrerequisiteGap: 0.03,
    maxPrerequisiteGaps: 0.1,
  },
  provisionalCut: 0.7,
  masteredCut: 0.85,
  masteredMaxOpenMistakes: 1,
  revisionDueRetention: 0.5,
  weakBelow: 0.6,
  prerequisiteWeakBelow: 0.5,
  phaseCutAdjustment: { 1: 0, 2: 0, 3: 0, 4: 0 },
};
