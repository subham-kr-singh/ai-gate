/**
 * Weekly review comparison (architecture §64). Numbers come from snapshots;
 * the summary sentences are generated here, deterministically. An LLM may
 * rephrase them in Part 7 but never supplies the figures.
 */
import type { DayKey } from "./dates";
import type { UnitSignals } from "./planner.types";
import type { EvidenceReport } from "../analytics/pace.service";

export interface SnapshotMetrics {
  phase: number;
  daysToExam: number | null;
  coverage: number;
  mastery: number | null;
  pyqAccuracy: number | null;
  pyqAttempted: number;
  revisionCoverage: number | null;
  mocksCompleted: number;
  paceStatus: string;
  slackDays: number | null;
  openMistakes: number;
  units: { id: string; coverage: number; mastery: number | null }[];
}

export interface WeeklyReport {
  from: DayKey | null;
  to: DayKey;
  coverageDelta: number | null;
  masteryDelta: number | null;
  pyqDelta: number | null;
  unitsCompleted: string[];
  improvements: { unitId: string; name: string; delta: number }[];
  regressions: { unitId: string; name: string; delta: number }[];
  unresolved: { unitId: string; name: string; concepts: number }[];
  summary: string[];
}

export function snapshotMetrics(
  units: UnitSignals[],
  evidence: EvidenceReport,
  phase: number,
  pace: { status: string; slackDays: number | null; daysToExam: number | null },
): SnapshotMetrics {
  return {
    phase,
    daysToExam: pace.daysToExam,
    coverage: evidence.syllabusCoverage,
    mastery: evidence.mastery,
    pyqAccuracy: evidence.pyqAccuracy,
    pyqAttempted: evidence.pyqAttempted,
    revisionCoverage: evidence.revisionCoverage,
    mocksCompleted: evidence.mocksCompleted,
    paceStatus: pace.status,
    slackDays: pace.slackDays,
    openMistakes: units.reduce((a, u) => a + u.openMistakes, 0),
    units: units.map((u) => ({ id: u.unitId, coverage: u.coverage, mastery: u.mastery })),
  };
}

const pts = (d: number) => `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)} points`;
const delta = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);

export function compareSnapshots(input: {
  to: DayKey;
  current: SnapshotMetrics;
  previous: { key: DayKey; metrics: SnapshotMetrics } | null;
  names: Record<string, string>;
  completedUnitNames: string[];
  units: UnitSignals[];
}): WeeklyReport {
  const { current, previous, names } = input;
  const prevUnits = new Map((previous?.metrics.units ?? []).map((u) => [u.id, u]));

  const moves = current.units
    .map((u) => ({ unitId: u.id, name: names[u.id] ?? u.id, delta: delta(u.mastery, prevUnits.get(u.id)?.mastery ?? null) }))
    .filter((m): m is { unitId: string; name: string; delta: number } => m.delta != null);

  const improvements = moves.filter((m) => m.delta >= 0.05).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const regressions = moves.filter((m) => m.delta <= -0.05).sort((a, b) => a.delta - b.delta).slice(0, 3);

  const unresolved = input.units
    .filter((u) => (u.plan.status === "GOOD_ENOUGH" || u.plan.status === "MOVED_ON") && u.plan.unresolvedConceptIds.length > 0)
    .map((u) => ({ unitId: u.unitId, name: u.unitName, concepts: u.plan.unresolvedConceptIds.length }));

  const coverageDelta = delta(current.coverage, previous?.metrics.coverage ?? null);
  const masteryDelta = delta(current.mastery, previous?.metrics.mastery ?? null);
  const pyqDelta = delta(current.pyqAccuracy, previous?.metrics.pyqAccuracy ?? null);

  const summary: string[] = [];
  if (!previous) summary.push("This is your first weekly review, so there is nothing to compare against yet.");
  if (coverageDelta != null) summary.push(`Syllabus coverage moved ${pts(coverageDelta)} to ${Math.round(current.coverage * 100)}%.`);
  if (masteryDelta != null && current.mastery != null) summary.push(`Mastery moved ${pts(masteryDelta)} to ${Math.round(current.mastery * 100)}%.`);
  if (pyqDelta != null && current.pyqAccuracy != null) summary.push(`PYQ accuracy moved ${pts(pyqDelta)} to ${Math.round(current.pyqAccuracy * 100)}%.`);
  if (input.completedUnitNames.length) summary.push(`Units closed this week: ${input.completedUnitNames.join(", ")}.`);
  if (improvements.length) summary.push(`Biggest gains: ${improvements.map((m) => m.name).join(", ")}.`);
  if (regressions.length) summary.push(`Slipped since last week: ${regressions.map((m) => m.name).join(", ")}.`);
  if (unresolved.length) summary.push(`${unresolved.length} closed ${unresolved.length === 1 ? "unit still has" : "units still have"} weak concepts waiting for revision.`);
  if (current.openMistakes > 0) summary.push(`${current.openMistakes} mistakes are open in the notebook.`);

  return {
    from: previous?.key ?? null,
    to: input.to,
    coverageDelta,
    masteryDelta,
    pyqDelta,
    unitsCompleted: input.completedUnitNames,
    improvements,
    regressions,
    unresolved,
    summary,
  };
}
