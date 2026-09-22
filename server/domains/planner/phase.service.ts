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
    // Last offset must land strictly before the exam date; on a one-day
    // runway that ceiling is 1, never 0 or negative.
    const ceiling = Math.max(1, span - 1);
    const clamp = (v: number) => Math.max(1, Math.min(v, ceiling));
    const offsets: [number, number, number] = [
      clamp(Math.round(span * f[0])),
      clamp(Math.round(span * (f[0] + f[1]))),
      clamp(Math.round(span * (f[0] + f[1] + f[2]))),
    ].sort((a, b) => a - b) as [number, number, number];

    // Cap the final phase at minFinalDays *before* enforcing order, then pull
    // each earlier offset down to stay non-decreasing. Doing it the other way
    // round lets the cap invert offsets[1]/offsets[2] on a 3-day runway, which
    // renders a window that ends before it starts.
    offsets[2] = Math.min(offsets[2], Math.max(1, span - PLANNER_CONFIG.phase.minFinalDays));
    offsets[1] = Math.min(offsets[1], offsets[2]);
    offsets[0] = Math.min(offsets[0], offsets[1]);

    // With four phases and at least three usable days the boundaries can be
    // strictly increasing; below that they collapse into zero-length windows
    // rather than being pushed past the exam. Either way: non-decreasing, and
    // every offset < span so no phase starts on or after the exam date.
    if (ceiling >= 3) {
      offsets[0] = clamp(Math.min(offsets[0], ceiling - 2));
      offsets[1] = Math.min(Math.max(offsets[1], offsets[0] + 1), ceiling - 1);
      offsets[2] = Math.min(Math.max(offsets[2], offsets[1] + 1), ceiling);
    }

    starts = [
      prepStartKey,
      addDays(prepStartKey, offsets[0]),
      addDays(prepStartKey, offsets[1]),
      addDays(prepStartKey, offsets[2]),
    ];
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
