/**
 * Fixed revision ladder for finished units (architecture "Fixed revision ladder
 * for units"). After a unit is settled it is due for revision 1, 3, 7, 14, 30
 * and 60 days later. A step counts as done when the student practised the unit
 * after it fell due — there is no separate "I revised it" button to forget.
 */
import { addDaysToDate, fracDays } from "./dates";
import { PLANNER_CONFIG } from "./planner.config";
import type { PlanItemUpdate, UnitSignals } from "./planner.types";

const LADDER = PLANNER_CONFIG.ladderDays;
const stepDays = (count: number) => LADDER[Math.min(count, LADDER.length - 1)] ?? 1;

export function ladderUpdates(units: UnitSignals[], now: Date): PlanItemUpdate[] {
  const out: PlanItemUpdate[] = [];
  for (const s of units) {
    const p = s.plan;
    if (p.status === "PENDING" || p.status === "ACTIVE") continue;

    if (!p.nextRevisionAt) {
      out.push({ unitId: s.unitId, patch: { nextRevisionAt: addDaysToDate(p.completedAt ?? now, stepDays(p.revisionCount)) } });
      continue;
    }
    const due = p.nextRevisionAt <= now;
    const practisedSinceDue = s.lastPracticedAt != null && fracDays(p.nextRevisionAt, s.lastPracticedAt) >= -1;
    if (due && practisedSinceDue && s.lastPracticedAt) {
      const count = p.revisionCount + 1;
      out.push({
        unitId: s.unitId,
        patch: { revisionCount: count, lastRevisedAt: s.lastPracticedAt, nextRevisionAt: addDaysToDate(s.lastPracticedAt, stepDays(count)) },
      });
    }
  }
  return out;
}
