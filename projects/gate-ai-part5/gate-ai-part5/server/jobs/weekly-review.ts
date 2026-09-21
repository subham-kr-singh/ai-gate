/**
 * Weekly review (architecture section 64): compare this week with last week,
 * store the report, and refresh the soft duration targets of units not yet
 * started from what the student's real velocity has been. Numbers are
 * deterministic; there is no LLM in this file.
 */
import { addDays, addDaysToDate } from "@/server/domains/planner/dates";
import * as repo from "@/server/domains/planner/planner.repository";
import { buildContext } from "@/server/domains/planner/planner.service";
import { classifyByDays, estimateUnitDays } from "@/server/domains/planner/velocity.service";
import { compareSnapshots, snapshotMetrics, type SnapshotMetrics } from "@/server/domains/planner/weekly";
import { runDailyMaintenance } from "./daily-maintenance";

const round025 = (x: number) => Math.round(x * 4) / 4;

export async function runWeeklyReview(userId: string, now = new Date()) {
  await runDailyMaintenance(userId, now); // make sure today's state and snapshot are current
  const ctx = await buildContext(userId, now);
  const { out, todayKey } = ctx;

  const current = snapshotMetrics(out.units, ctx.evidence, ctx.phase.phase, ctx.pace);
  const prevRow = await repo.snapshotOnOrBefore(userId, "DAILY", addDays(todayKey, -7));
  const previous = prevRow ? { key: prevRow.capturedOn.toISOString().slice(0, 10), metrics: prevRow.metrics as unknown as SnapshotMetrics } : null;

  const names = Object.fromEntries(out.units.map((u) => [u.unitId, u.unitName]));
  const closedIds = new Set(await repo.unitsClosedSince(userId, addDaysToDate(now, -7)));
  const report = compareSnapshots({
    to: todayKey,
    current,
    previous,
    names,
    completedUnitNames: out.units.filter((u) => closedIds.has(u.unitId)).map((u) => u.unitName),
    units: out.units,
  });

  await repo.upsertSnapshot(userId, "WEEKLY", todayKey, {
    phase: ctx.phase.phase,
    daysToExam: ctx.phase.daysToExam,
    metrics: current as never,
    report: report as never,
  });

  // Update the plan: unstarted units inherit what this student's pace has actually been.
  if (ctx.velocity.sampleCount >= 3) {
    await repo.updatePendingTargets(
      userId,
      out.units
        .filter((u) => u.plan.status === "PENDING")
        .map((u) => {
          const days = estimateUnitDays({ subjectId: u.subjectId, difficultyClass: u.plan.difficultyClass }, ctx.velocity);
          return { unitId: u.unitId, targetDays: Math.min(3, Math.max(0.5, round025(days))), difficultyClass: classifyByDays(days) };
        }),
    );
  }
  return { userId, day: todayKey, summaryLines: report.summary.length };
}
