import type { DayKey } from "./dates";

export type Phase = 1 | 2 | 3 | 4;
export type DifficultyClass = "EASY" | "MEDIUM" | "HARD";

export type PlanItemStatus =
  | "PENDING"
  | "ACTIVE"
  | "PROVISIONALLY_COMPLETE"
  | "GOOD_ENOUGH"
  | "MOVED_ON"
  | "MASTERED";

export const SETTLED_STATUSES: readonly PlanItemStatus[] = [
  "PROVISIONALLY_COMPLETE",
  "GOOD_ENOUGH",
  "MOVED_ON",
  "MASTERED",
];

export type PlannerAction =
  | "STUDY_CONCEPT"
  | "REVISE_CONCEPT"
  | "SOLVE_EASY"
  | "SOLVE_MEDIUM"
  | "SOLVE_HARD"
  | "REVIEW_MISTAKES"
  | "TAKE_MINI_TEST"
  | "TAKE_TOPIC_TEST"
  | "TAKE_MOCK"
  | "FLASHCARD_REVIEW";

export type ReasonType =
  | "LOW_MASTERY"
  | "LOW_RECENT_ACCURACY"
  | "PYQ_WEAKNESS"
  | "REPEATED_MISTAKES"
  | "PREREQUISITE_GAP"
  | "REVISION_DUE"
  | "HIGH_MARKS_WEIGHT"
  | "SYLLABUS_REMAINING"
  | "UNVERIFIED_COVERAGE"
  | "MOVED_ON_WEAKNESS"
  | "MOCK_DUE"
  | "FLASHCARDS_DUE"
  | "NEXT_IN_SEQUENCE"
  | "WITHIN_EXTENSION";

export interface Reason {
  type: ReasonType;
  value: number;
}

export interface PhaseWindow {
  phase: Phase;
  startKey: DayKey;
  /** Exclusive. The last window ends on the exam date. */
  endKey: DayKey;
}

export interface PhaseInfo {
  phase: Phase;
  label: string;
  focus: string;
  startKey: DayKey;
  endKey: DayKey | null;
  daysIntoPhase: number;
  daysLeftInPhase: number | null;
  daysToExam: number | null;
  windows: PhaseWindow[];
  /** True when no exam date is set and phase 1 is assumed. */
  assumed: boolean;
}

export interface ConceptSignal {
  conceptId: string;
  name: string;
  mastery: number | null;
  attempts: number;
  unitId?: string;
  unitName?: string;
}

export interface UnitPlanSignal {
  status: PlanItemStatus;
  sequence: number;
  difficultyClass: DifficultyClass;
  targetDays: number;
  maxExtensionDays: number;
  startedAt: Date | null;
  completedAt: Date | null;
  actualDays: number | null;
  snoozedUntil: Date | null;
  revisionCount: number;
  lastRevisedAt: Date | null;
  nextRevisionAt: Date | null;
  unresolvedConceptIds: string[];
}

/** Everything the planner knows about one unit, already reduced to numbers. */
export interface UnitSignals {
  unitId: string;
  unitName: string;
  subjectId: string;
  subjectName: string;
  conceptCount: number;
  /** 0..1 — max(student-reported coverage, mean concept completion). */
  coverage: number;
  /** Null until at least one concept has been attempted. */
  mastery: number | null;
  attempts: number;
  correct: number;
  practiceAccuracy: number | null;
  recentAccuracy: number | null;
  recentAttempts: number;
  pyqAttempts: number;
  pyqCorrect: number;
  pyqAccuracy: number | null;
  /** Lifetime mistakes across the unit's concepts (frequency signal). */
  mistakes: number;
  /** Mistakes not yet resolved in the mistake notebook. */
  openMistakes: number;
  retention: number | null;
  dueConceptCount: number;
  revisionDueShare: number;
  avgOverdueDays: number;
  /** Share of dependent concepts whose prerequisites look shaky (0..1). */
  prereqGap: number;
  /** How much other material depends on this unit, normalised to the max unit (0..1). */
  prereqImportance: number;
  prereqBlockers: ConceptSignal[];
  weakConcepts: ConceptSignal[];
  uncovered: ConceptSignal[];
  lastPracticedAt: Date | null;
  /** Exam-marks importance normalised so the most important unit is 1. */
  marksShare: number;
  plan: UnitPlanSignal;
}

export type PriorityKey =
  | "weakness"
  | "importance"
  | "remaining"
  | "prereq"
  | "mistakes"
  | "revision"
  | "recent";

export interface PriorityResult {
  version: string;
  phase: Phase;
  score: number;
  components: Record<PriorityKey, number>;
  weights: Record<PriorityKey, number>;
  contributions: Record<PriorityKey, number>;
}

export type ExitState =
  | "NOT_STARTED"
  | "UNVERIFIED"
  | "CONTINUE"
  | "PROVISIONALLY_COMPLETE"
  | "GOOD_ENOUGH";

export interface ExitEvaluation {
  version: string;
  state: ExitState;
  readiness: number | null;
  threshold: number;
  elapsedDays: number;
  daysLeftInExtension: number;
  improving: boolean;
  unresolvedConceptIds: string[];
}

export interface ActionStep {
  label: string;
}

export interface Candidate {
  id: string;
  action: PlannerAction;
  targetType: "UNIT" | "CONCEPT" | "GLOBAL";
  unitId: string | null;
  unitName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  conceptId: string | null;
  conceptName: string | null;
  /** 0..1 */
  priority: number;
  reasons: Reason[];
  steps: ActionStep[];
  href: string;
  sequence: number;
}

export interface PlanItemPatch {
  status?: PlanItemStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  actualDays?: number | null;
  exitReason?: string | null;
  unresolved?: { conceptIds: string[]; readiness: number | null } | null;
  snoozedUntil?: Date | null;
  revisionCount?: number;
  lastRevisedAt?: Date | null;
  nextRevisionAt?: Date | null;
}

export interface PlanItemUpdate {
  unitId: string;
  patch: PlanItemPatch;
}
