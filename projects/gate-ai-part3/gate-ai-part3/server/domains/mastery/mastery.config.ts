/**
 * Mastery / retention parameters.
 *
 * These are engineering parameters, not scientific constants. They are
 * versioned: if you change the math, bump MASTERY_ALGORITHM_VERSION so
 * historical rows stay explainable.
 */
export const MASTERY_ALGORITHM_VERSION = "v1";
export const RETENTION_ALGORITHM_VERSION = "v1";

export interface MasteryConfig {
  /** EMA weight for mastery: mastery += alpha * (result - mastery). */
  alpha: number;
  /** EMA weight for recentAccuracy (reacts faster than mastery). */
  recentAlpha: number;
  /** EMA weight for normalised self-confidence. */
  confidenceAlpha: number;
  /** Baseline used for the first piece of evidence on a concept. */
  priorMastery: number;
  /** retention = mastery * exp(-daysSinceLastSeen / tau). */
  retentionTauDays: number;
  /** Concept completion set by a first attempt (exposure, not mastery). */
  completionOnFirstAttempt: number;
  /** Weight of self-reported (Quick Study Report) questions vs app-graded ones. */
  selfReportWeight: number;
  /** A "weak topic" flag counts as this many incorrect observations. */
  weakFlagObservations: number;
  /** Weak-concept list: mastery below this... */
  weakBelow: number;
  /** ...and at least this many graded attempts. */
  minAttemptsForWeakList: number;
  /** A concept shows as locked until each prerequisite reaches this mastery. Display only; nothing is blocked. */
  prerequisiteGateAt: number;
}

export const DEFAULT_MASTERY_CONFIG: MasteryConfig = {
  alpha: 0.3,
  recentAlpha: 0.5,
  confidenceAlpha: 0.3,
  priorMastery: 0.5,
  retentionTauDays: 14,
  completionOnFirstAttempt: 0.5,
  selfReportWeight: 0.5,
  weakFlagObservations: 1,
  weakBelow: 0.6,
  minAttemptsForWeakList: 3,
  prerequisiteGateAt: 0.7,
};
