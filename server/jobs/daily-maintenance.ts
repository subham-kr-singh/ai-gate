/**
 * Daily maintenance (architecture section 63). Idempotent: running it twice
 * in a day changes nothing the second time.
 *
 *   update retention -> sync plan state (rolls units past their maximum
 *   extension) -> advance the revision ladder -> write today's snapshot ->
 *   prepare tomorrow's DPP (via an injected hook from Part 4)
 */
import { PLANNER_CONFIG } from "@/server/domains/planner/planner.config";
import * as repo from "@/server/domains/planner/planner.repository";
import { buildContext } from "@/server/domains/planner/planner.service";
import { ladderUpdates } from "@/server/domains/planner/revision-ladder";
import { snapshotMetrics } from "@/server/domains/planner/weekly";

export interface MaintenanceHooks {
  /** e.g. (userId) => dppService.generateToday(userId) — wired in the cron route once Part 4 exposes it. */
  prepareDpp?: (userId: string, now: Date) => Promise<unknown>;
}

export async function runDailyMaintenance(userId: string, now = new Date(), hooks: MaintenanceHooks = {}) {
  const retentionRows = await repo.refreshRetention(userId, now, PLANNER_CONFIG.retentionTauDays);

  // buildContext applies plan transitions (ACTIVE -> PROVISIONALLY_COMPLETE / GOOD_ENOUGH).
  const ctx = await buildContext(userId, now);
  const ladder = ladderUpdates(ctx.out.units, now);
  await repo.applyPlanItemUpdates(userId, ladder);

  await repo.upsertSnapshot(userId, "DAILY", ctx.todayKey, {
    phase: ctx.phase.phase,
    daysToExam: ctx.phase.daysToExam,
    metrics: snapshotMetrics(ctx.out.units, ctx.evidence, ctx.phase.phase, ctx.pace) as never,
  });

  let dpp: "skipped" | "prepared" | "failed" = "skipped";
  if (hooks.prepareDpp) {
    try {
      await hooks.prepareDpp(userId, now);
      dpp = "prepared";
    } catch (e) {
      console.error("daily-maintenance: DPP preparation failed", e);
      dpp = "failed";
    }
  }

  return {
    userId,
    day: ctx.todayKey,
    retentionRows,
    planTransitions: ctx.out.updates.length,
    ladderUpdates: ladder.length,
    dpp,
    averageDaysPerUnit: ctx.velocity.averageDays,
  };
}
