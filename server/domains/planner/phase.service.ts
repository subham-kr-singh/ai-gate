import { addDays, daysBetween, type DayKey } from "./dates";
import { PLANNER_CONFIG } from "./planner.config";
import type { Phase, PhaseInfo, PhaseWindow } from "./planner.types";

export const PHASE_META: Record<Phase, { label: string; focus: string }> = {
  1: { label: "Coverage and foundation", focus: "Work through the syllabus, highest-marks units first." },
  2: { label: "Coverage completion and intensive practice", focus: "Finish what is uncovered and practise it hard." },
  3: { label: "Revision, PYQs and weak-area repair", focus: "Repair weak units, revise, and solve past papers." },
  4: { label: "Mocks and final revision", focus: "Full mocks, error review and final revision." },
};

export interface PhaseInput {
  todayKey: DayKey;
  prepStartKey: DayKey;
  examKey: DayKey | null;
  /** Optional explicit start dates of phases 2, 3 and 4. */
  explicitStarts?: [DayKey, DayKey, DayKey] | null;
}

/** The four phase windows between prepStart and the exam date. */
export function phaseWindows(
  prepStartKey: DayKey,
  examKey: DayKey,
  explicit?: [DayKey, DayKey, DayKey] | null,
): PhaseWindow[] {
  const span = Math.max(1, daysBetween(prepStartKey, examKey));
  let starts: DayKey[];

  const explicitOk =
    explicit &&
    explicit[0] > prepStartKey &&
    explicit[0] < explicit[1] &&
    explicit[1] < explicit[2] &&
    explicit[2] < examKey;

  if (explicit && explicitOk) {
    starts = [prepStartKey, ...explicit];
  } else {
    const f = PLANNER_CONFIG.phaseFractions;
    let o2 = Math.round(span * f[0]);
    let o3 = Math.round(span * (f[0] + f[1]));
    let o4 = Math.round(span * (f[0] + f[1] + f[2]));
    o4 = Math.min(o4, span - PLANNER_CONFIG.phase.minFinalDays);
    // Strictly increasing, and never past the exam date, even for very short runways.
    o2 = Math.max(1, Math.min(o2, span - 3));
    o3 = Math.max(o2 + 1, Math.min(o3, span - 2));
    o4 = Math.max(o3 + 1, Math.min(o4, span - 1));
    starts = [prepStartKey, addDays(prepStartKey, o2), addDays(prepStartKey, o3), addDays(prepStartKey, o4)];
  }

  return starts.map((startKey, i) => ({
    phase: (i + 1) as Phase,
    startKey,
    endKey: i < 3 ? starts[i + 1]! : examKey,
  }));
}

export function resolvePhase(input: PhaseInput): PhaseInfo {
  const { todayKey, prepStartKey, examKey } = input;

  if (!examKey) {
    return {
      phase: 1,
      ...PHASE_META[1],
      startKey: prepStartKey,
      endKey: null,
      daysIntoPhase: Math.max(0, daysBetween(prepStartKey, todayKey)),
      daysLeftInPhase: null,
      daysToExam: null,
      windows: [],
      assumed: true,
    };
  }

  const windows = phaseWindows(prepStartKey, examKey, input.explicitStarts);
  let idx = windows.findIndex((w) => todayKey >= w.startKey && todayKey < w.endKey);
  if (todayKey < windows[0]!.startKey) idx = 0;
  if (idx < 0) idx = 3; // on or after the exam date
  const w = windows[idx] ?? windows[windows.length - 1]!;

  return {
    phase: w.phase,
    ...PHASE_META[w.phase],
    startKey: w.startKey,
    endKey: w.endKey,
    daysIntoPhase: Math.max(0, daysBetween(w.startKey, todayKey)),
    daysLeftInPhase: Math.max(0, daysBetween(todayKey, w.endKey)),
    daysToExam: daysBetween(todayKey, examKey),
    windows,
    assumed: false,
  };
}
