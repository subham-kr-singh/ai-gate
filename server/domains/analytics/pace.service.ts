/**
 * Pace and "am I on track?" numbers (architecture §33-36).
 *
 * Reports pace and remaining workload. It deliberately never predicts a score,
 * rank or exam outcome, and never answers "behind" with "study more hours".
 */
import { addDays, daysBetween, type DayKey } from "../planner/dates";
import { PACE_VERSION, PLANNER_CONFIG } from "../planner/planner.config";
import type { ExitEvaluation, PhaseInfo, UnitSignals } from "../planner/planner.types";
import { estimateUnitDays, type VelocityModel } from "../planner/velocity.service";

export type PaceStatus = "ON_TRACK" | "NEEDS_ATTENTION" | "BEHIND" | "NO_EXAM_DATE";

export interface PaceReport {
  version: string;
  status: PaceStatus;
  daysToExam: number | null;
  /** Coverage should be finished by the start of phase 3. */
  coverageDeadlineKey: DayKey | null;
  daysToCoverageDeadline: number | null;
  remainingUnitEquivalents: number;
  estRemainingStudyDays: number;
  projectedFinishKey: DayKey | null;
  /** Positive = finishing before the deadline, negative = after it. */
  slackDays: number | null;
  expectedCoverage: number | null;
  actualCoverage: number;
  requiredUnitsPerDay: number | null;
  currentDaysPerUnit: number | null;
}

export function computePace(input: {
  todayKey: DayKey;
  prepStartKey: DayKey;
  examKey: DayKey | null;
  phase: PhaseInfo;
  units: UnitSignals[];
  velocity: VelocityModel;
}): PaceReport {
  const { units, velocity, phase, todayKey, prepStartKey, examKey } = input;
  const n = Math.max(1, units.length);
  const actualCoverage = units.reduce((a, u) => a + u.coverage, 0) / n;

  const remainingUnitEquivalents = units.reduce((a, u) => a + (1 - u.coverage), 0);
  const estDays = units.reduce(
    (a, u) => a + (1 - u.coverage) * estimateUnitDays({ subjectId: u.subjectId, difficultyClass: u.plan.difficultyClass }, velocity),
    0,
  );

  const currentDaysPerUnit = velocity.averageDays;

  if (!examKey || phase.assumed) {
    return {
      version: PACE_VERSION,
      status: "NO_EXAM_DATE",
      daysToExam: null,
      coverageDeadlineKey: null,
      daysToCoverageDeadline: null,
      remainingUnitEquivalents,
      estRemainingStudyDays: estDays,
      projectedFinishKey: null,
      slackDays: null,
      expectedCoverage: null,
      actualCoverage,
      requiredUnitsPerDay: null,
      currentDaysPerUnit,
    };
  }

  const perWeek = PLANNER_CONFIG.pace.studyDaysPerWeek;
  const calendarDays = Math.ceil((estDays * 7) / perWeek);
  const projectedFinishKey = addDays(todayKey, calendarDays);
  const coverageDeadlineKey = phase.windows[2]?.startKey ?? null;
  const daysToCoverageDeadline = coverageDeadlineKey ? daysBetween(todayKey, coverageDeadlineKey) : null;
  const slackDays = coverageDeadlineKey ? daysBetween(projectedFinishKey, coverageDeadlineKey) : null;

  let status: PaceStatus = "ON_TRACK";
  if (slackDays != null && slackDays < 0) {
    status = slackDays >= PLANNER_CONFIG.pace.needsAttemptSlackDays ? "NEEDS_ATTENTION" : "BEHIND";
  }
  if (remainingUnitEquivalents < 0.5) status = "ON_TRACK";

  let expectedCoverage: number | null = null;
  if (coverageDeadlineKey) {
    const total = Math.max(1, daysBetween(prepStartKey, coverageDeadlineKey));
    expectedCoverage = Math.min(1, Math.max(0, daysBetween(prepStartKey, todayKey) / total));
  }
  const usableDays = daysToCoverageDeadline != null ? (Math.max(0, daysToCoverageDeadline) * perWeek) / 7 : null;
  const requiredUnitsPerDay = usableDays != null && usableDays > 0 ? remainingUnitEquivalents / usableDays : null;

  return {
    version: PACE_VERSION,
    status,
    daysToExam: daysBetween(todayKey, examKey),
    coverageDeadlineKey,
    daysToCoverageDeadline,
    remainingUnitEquivalents,
    estRemainingStudyDays: estDays,
    projectedFinishKey,
    slackDays,
    expectedCoverage,
    actualCoverage,
    requiredUnitsPerDay,
    currentDaysPerUnit,
  };
}

/* ------------------------------------------------------------------ */
/* "Am I on track?" evidence dashboard                                 */
/* ------------------------------------------------------------------ */

export interface EvidenceReport {
  syllabusCoverage: number;
  /** Coverage-weighted mean mastery of units with attempts. Null before any practice. */
  mastery: number | null;
  pyqAccuracy: number | null;
  pyqAttempted: number;
  /** Share of studied concepts that are not overdue for review. */
  revisionCoverage: number | null;
  mocksCompleted: number;
  mockTarget: number;
}

export function buildEvidence(units: UnitSignals[], mocksCompleted: number): EvidenceReport {
  const n = Math.max(1, units.length);
  const withMastery = units.filter((u) => u.mastery != null && u.coverage > 0);
  const wsum = withMastery.reduce((a, u) => a + u.coverage, 0);
  const pyqA = units.reduce((a, u) => a + u.pyqAttempts, 0);
  const pyqC = units.reduce((a, u) => a + u.pyqCorrect, 0);
  const touchedUnits = units.filter((u) => u.mastery != null);
  const revisionCoverage = touchedUnits.length
    ? touchedUnits.reduce((a, u) => a + (1 - u.revisionDueShare), 0) / touchedUnits.length
    : null;

  return {
    syllabusCoverage: units.reduce((a, u) => a + u.coverage, 0) / n,
    mastery: wsum > 0 ? withMastery.reduce((a, u) => a + (u.mastery as number) * u.coverage, 0) / wsum : null,
    pyqAccuracy: pyqA > 0 ? pyqC / pyqA : null,
    pyqAttempted: pyqA,
    revisionCoverage,
    mocksCompleted,
    mockTarget: PLANNER_CONFIG.actions.mockTarget,
  };
}

/* ------------------------------------------------------------------ */
/* "Why am I not progressing?" (numbers from data, text from code)      */
/* ------------------------------------------------------------------ */

export type WhyType =
  | "EXTRA_TIME"
  | "PREREQUISITE_GAPS"
  | "LOW_PYQ"
  | "OPEN_MISTAKES"
  | "REVISION_BACKLOG"
  | "SLOW_SUBJECT"
  | "UNRESOLVED_CARRYOVER";

export interface WhyItem {
  type: WhyType;
  text: string;
  value: number;
}

const list = (xs: string[], max = 3) => (xs.length > max ? `${xs.slice(0, max).join(", ")} and ${xs.length - max} more` : xs.join(", "));

export function explainProgress(
  units: UnitSignals[],
  exits: Record<string, ExitEvaluation>,
  velocity: VelocityModel,
): WhyItem[] {
  const items: WhyItem[] = [];

  const slow = units.filter((u) => {
    const t = u.plan.targetDays;
    return (u.plan.actualDays != null && u.plan.actualDays > t) || (u.plan.status === "ACTIVE" && (exits[u.unitId]?.elapsedDays ?? 0) > t);
  });
  if (slow.length)
    items.push({ type: "EXTRA_TIME", value: slow.length, text: `${slow.length} ${slow.length === 1 ? "unit ran" : "units ran"} past the target duration: ${list(slow.map((u) => u.unitName))}.` });

  const gaps = units.filter((u) => u.prereqGap >= PLANNER_CONFIG.exit.prereqGapThreshold);
  if (gaps.length)
    items.push({ type: "PREREQUISITE_GAPS", value: gaps.length, text: `Prerequisite mastery is low in ${list(gaps.map((u) => u.unitName))}, which slows the units that build on it.` });

  const lowPyq = units.filter((u) => u.pyqAttempts >= 5 && (u.pyqAccuracy ?? 1) < 0.55).sort((a, b) => (a.pyqAccuracy ?? 1) - (b.pyqAccuracy ?? 1));
  if (lowPyq.length)
    items.push({ type: "LOW_PYQ", value: lowPyq.length, text: `PYQ accuracy is below 55% in ${list(lowPyq.map((u) => `${u.unitName} (${Math.round((u.pyqAccuracy ?? 0) * 100)}%)`))}.` });

  const open = units.reduce((a, u) => a + u.openMistakes, 0);
  if (open >= 5) items.push({ type: "OPEN_MISTAKES", value: open, text: `${open} mistakes are still open in the notebook.` });

  const due = units.reduce((a, u) => a + u.dueConceptCount, 0);
  if (due >= 5) items.push({ type: "REVISION_BACKLOG", value: due, text: `${due} concepts are overdue for review.` });

  const carry = units.filter((u) => u.plan.unresolvedConceptIds.length > 0 && (u.plan.status === "GOOD_ENOUGH" || u.plan.status === "MOVED_ON"));
  if (carry.length)
    items.push({ type: "UNRESOLVED_CARRYOVER", value: carry.length, text: `${carry.length} ${carry.length === 1 ? "unit was" : "units were"} closed with weak concepts still unresolved: ${list(carry.map((u) => u.unitName))}.` });

  const slowest = Object.entries(velocity.bySubject).filter(([, v]) => v.n >= 2).sort((a, b) => b[1].days - a[1].days)[0];
  if (slowest) {
    const name = units.find((u) => u.subjectId === slowest[0])?.subjectName ?? "One subject";
    items.push({ type: "SLOW_SUBJECT", value: slowest[1].days, text: `${name} is taking about ${slowest[1].days.toFixed(1)} days per unit.` });
  }
  return items;
}
