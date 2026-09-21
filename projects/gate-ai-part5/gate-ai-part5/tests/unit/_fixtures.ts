import type { UnitPlanSignal, UnitSignals } from "@/server/domains/planner/planner.types";

export const NOW = new Date("2026-09-19T06:00:00Z");
export const daysAgo = (n: number, from = NOW) => new Date(from.getTime() - n * 86_400_000);

export function plan(over: Partial<UnitPlanSignal> = {}): UnitPlanSignal {
  return {
    status: "PENDING",
    sequence: 0,
    difficultyClass: "MEDIUM",
    targetDays: 1,
    maxExtensionDays: 2,
    startedAt: null,
    completedAt: null,
    actualDays: null,
    snoozedUntil: null,
    revisionCount: 0,
    lastRevisedAt: null,
    nextRevisionAt: null,
    unresolvedConceptIds: [],
    ...over,
  };
}

export function unit(over: Partial<UnitSignals> = {}): UnitSignals {
  return {
    unitId: "u1",
    unitName: "Unit 1",
    subjectId: "s1",
    subjectName: "Operating Systems",
    conceptCount: 10,
    coverage: 0,
    mastery: null,
    attempts: 0,
    correct: 0,
    practiceAccuracy: null,
    recentAccuracy: null,
    recentAttempts: 0,
    pyqAttempts: 0,
    pyqCorrect: 0,
    pyqAccuracy: null,
    mistakes: 0,
    openMistakes: 0,
    retention: null,
    dueConceptCount: 0,
    revisionDueShare: 0,
    avgOverdueDays: 0,
    prereqGap: 0,
    prereqImportance: 0,
    prereqBlockers: [],
    weakConcepts: [],
    uncovered: [{ conceptId: "c1", name: "First concept", mastery: null, attempts: 0 }],
    lastPracticedAt: null,
    marksShare: 0.5,
    plan: plan(),
    ...over,
  };
}

/** A unit the student has worked on, with evidence. */
export function studied(over: Partial<UnitSignals> = {}, planOver: Partial<UnitPlanSignal> = {}): UnitSignals {
  return unit({
    coverage: 1,
    mastery: 0.5,
    attempts: 30,
    correct: 16,
    practiceAccuracy: 16 / 30,
    recentAccuracy: 0.45,
    recentAttempts: 10,
    pyqAttempts: 10,
    pyqCorrect: 5,
    pyqAccuracy: 0.5,
    mistakes: 6,
    plan: plan({ status: "ACTIVE", startedAt: daysAgo(0.5), ...planOver }),
    ...over,
  });
}
