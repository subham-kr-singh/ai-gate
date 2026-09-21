/**
 * Personal unit velocity (architecture §28). Learns how long units really take
 * for this student. The result is a soft estimate — it never becomes a deadline.
 */
import { PLANNER_CONFIG } from "./planner.config";
import type { DifficultyClass } from "./planner.types";

export interface VelocitySample {
  subjectId: string;
  difficultyClass: DifficultyClass;
  actualDays: number;
}

export interface VelocityModel {
  sampleCount: number;
  /** Average days per unit across all finished units, null with no samples. */
  averageDays: number | null;
  byClass: Record<DifficultyClass, number>;
  bySubject: Record<string, { days: number; n: number }>;
}

export function classifyByDays(days: number): DifficultyClass {
  if (days <= 0.9) return "EASY";
  if (days <= 1.6) return "MEDIUM";
  return "HARD";
}

export function estimateVelocity(samples: VelocitySample[]): VelocityModel {
  const prior = PLANNER_CONFIG.unit.priorDays;
  const k = PLANNER_CONFIG.unit.velocityShrinkageK;
  const valid = samples.filter((s) => Number.isFinite(s.actualDays) && s.actualDays > 0);

  const byClass = {} as Record<DifficultyClass, number>;
  for (const c of ["EASY", "MEDIUM", "HARD"] as DifficultyClass[]) {
    const xs = valid.filter((s) => s.difficultyClass === c).map((s) => s.actualDays);
    byClass[c] = (xs.reduce((a, b) => a + b, 0) + k * prior[c]) / (xs.length + k);
  }

  const bySubject: VelocityModel["bySubject"] = {};
  for (const s of valid) {
    const cur = bySubject[s.subjectId] ?? { days: 0, n: 0 };
    bySubject[s.subjectId] = { days: cur.days + s.actualDays, n: cur.n + 1 };
  }
  for (const id of Object.keys(bySubject)) {
    const item = bySubject[id];
    if (item) {
      bySubject[id] = { days: item.days / item.n, n: item.n };
    }
  }

  return {
    sampleCount: valid.length,
    averageDays: valid.length ? valid.reduce((a, s) => a + s.actualDays, 0) / valid.length : null,
    byClass,
    bySubject,
  };
}

/** Expected days for a whole unit: subject history if any, blended toward the class average. */
export function estimateUnitDays(
  unit: { subjectId: string; difficultyClass: DifficultyClass },
  v: VelocityModel,
): number {
  const classDays = v.byClass[unit.difficultyClass];
  const subj = v.bySubject[unit.subjectId];
  if (!subj) return classDays;
  const w = subj.n / (subj.n + PLANNER_CONFIG.unit.velocityShrinkageK);
  return w * subj.days + (1 - w) * classDays;
}
