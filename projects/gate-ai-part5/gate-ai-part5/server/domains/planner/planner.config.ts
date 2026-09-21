/**
 * Every tunable number in the planner lives here. Nothing in this file is a
 * scientific constant — these are engineering starting points. Bump the
 * matching *_VERSION whenever a change alters recommendations, so stored
 * PlannerDecision rows stay explainable (architecture §75).
 */
import type { DifficultyClass, Phase, PriorityKey } from "./planner.types";

export const PRIORITY_VERSION = "priority-v1";
export const PLANNER_VERSION = "planner-v1";
export const PHASE_VERSION = "phase-v1";
export const EXIT_VERSION = "unit-exit-v1";
export const PACE_VERSION = "pace-v1";

/** Weight profile per preparation phase. Each row sums to 1. */
export const PHASE_WEIGHTS: Record<Phase, Record<PriorityKey, number>> = {
  // Coverage and foundation: get through the syllabus, biggest marks first
  1: { remaining: 0.3, importance: 0.2, prereq: 0.15, weakness: 0.12, recent: 0.08, mistakes: 0.05, revision: 0.1 },
  // Coverage completion and intensive practice
  2: { remaining: 0.22, importance: 0.18, weakness: 0.2, prereq: 0.12, mistakes: 0.08, revision: 0.08, recent: 0.12 },
  // Revision, PYQs, weak-area repair
  3: { remaining: 0.1, importance: 0.18, weakness: 0.26, prereq: 0.1, mistakes: 0.12, revision: 0.14, recent: 0.1 },
  // Mocks and final revision
  4: { remaining: 0.05, importance: 0.17, weakness: 0.24, prereq: 0.06, mistakes: 0.12, revision: 0.24, recent: 0.12 },
};

export const PLANNER_CONFIG = {
  /** Phase boundaries as fractions of [prepStart, examDate]; must sum to 1. */
  phaseFractions: [0.3, 0.25, 0.25, 0.2] as [number, number, number, number],
  phase: { minFinalDays: 14 },

  /** Shrink performance toward 0.5 when evidence is thin: (perf*n + 0.5*k) / (n + k). */
  shrinkageK: 5,
  weaknessBlend: { mastery: 0.5, pyq: 0.3, practice: 0.2 },
  mistakeSaturation: 10,
  recentAttemptsHalfWeight: 3,
  revisionBlend: { dueShare: 0.4, overdue: 0.25, ladder: 0.2, forgetting: 0.15 },
  retentionTauDays: 14,

  /** Bonus for staying on a unit that is ACTIVE and still CONTINUE, per phase 1..4 (limits thrashing). */
  continuityBonus: [0.15, 0.15, 0.05, 0.05] as [number, number, number, number],

  unit: {
    /** Seeded from the student's stated pace: roughly one unit a day, hard units two or three. Replaced by observed velocity as units finish. */
    priorDays: { EASY: 0.8, MEDIUM: 1, HARD: 2 } as Record<DifficultyClass, number>,
    defaultTargetDays: 1,
    defaultMaxExtensionDays: 2,
    velocityShrinkageK: 2,
    /** A MOVED_ON unit becomes a revision candidate this many days after the student moved on. */
    revisitAfterDays: 3,
  },

  exit: {
    minEvidenceAttempts: 5,
    strongReadiness: 0.75,
    /** Added to the bar in phases 1..4 — later phases accept "good enough" sooner. */
    phaseAdjust: [0, 0, -0.03, -0.06] as [number, number, number, number],
    minCoverage: 0.8,
    mistakePenaltyEach: 0.02,
    mistakePenaltyCap: 0.12,
    prereqGapThreshold: 0.3,
    prereqPenalty: 0.1,
    weakConceptBelow: 0.6,
  },

  actions: {
    practiceBands: [0.5, 0.75] as [number, number],
    reviewMistakesMin: 6,
    masteryCheckMargin: 0.08,
    masteryCheckMinAttempts: 10,
    studyBelowCoverage: 0.5,
    unverifiedCoverage: 0.8,
    flashcardsMinDue: 5,
    flashcardsFullAt: 30,
    mockMinCoverage: 0.6,
    mockIntervalDays: { 3: 10, 4: 5 } as Record<number, number>,
    mockTarget: 8,
    revisionMinUrgency: 0.15,
    maxAlternatives: 4,
  },

  /** Revision ladder for finished units (days after completion / previous revision). */
  ladderDays: [1, 3, 7, 14, 30, 60],

  pace: {
    studyDaysPerWeek: 6,
    needsAttemptSlackDays: -7,
  },

  /** Marks-importance fallback until the PYQ bank is large enough to derive it. Approximate, editable. */
  marks: {
    minPyqMarksToTrust: 150,
    subjectFallback: [
      [/aptitude/i, 15],
      [/mathematics|discrete/i, 13],
      [/theory of computation/i, 7],
      [/digital/i, 6],
      [/organi[sz]ation|architecture/i, 8],
      [/programming|data structures/i, 9],
      [/algorithm/i, 9],
      [/compiler/i, 6],
      [/operating/i, 9],
      [/database/i, 9],
      [/network/i, 8],
    ] as [RegExp, number][],
    fallbackDefault: 8,
  },
} as const;
