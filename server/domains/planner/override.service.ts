/**
 * User override (architecture section 40). The system recommends; the student
 * decides. An override is recorded as an explicit decision, never fought and
 * never used to erase evidence — moving on from a weak unit leaves its weak
 * concepts owed for revision.
 */
import { z } from "zod";
import { addDaysToDate, dayKey } from "./dates";
import { buildContext } from "./planner.service";
import * as repo from "./planner.repository";

export const overrideSchema = z
  .object({
    decisionId: z.string().min(1).optional(),
    choice: z.enum(["FOLLOW", "OVERRIDE", "SKIP", "SNOOZE"]),
    chosenUnitId: z.string().min(1).optional(),
    reason: z.string().trim().max(500).optional(),
    snoozeDays: z.number().int().min(1).max(14).optional(),
    /** With OVERRIDE: leave the recommended unit now and keep its weak concepts owed for revision. */
    moveOn: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.choice === "OVERRIDE" && !v.chosenUnitId) {
      ctx.addIssue({ code: "custom", path: ["chosenUnitId"], message: "Pick the unit you want to work on instead." });
    }
  });

export type OverrideInput = z.infer<typeof overrideSchema>;

export async function recordOverride(userId: string, input: OverrideInput, now = new Date()) {
  const plan = await repo.getOrCreatePlan(userId, now);
  const forKey = dayKey(now, plan.timezone);
  const decision = input.decisionId ? await repo.getDecision(userId, input.decisionId) : null;
  const effects: string[] = [];

  const base = {
    userId,
    forKey,
    decisionId: decision?.id ?? null,
    choice: input.choice,
    recommendedAction: decision?.action ?? null,
    recommendedUnitId: decision?.unitId ?? null,
    reason: input.reason ?? null,
  } as const;

  if (input.choice === "FOLLOW") {
    const o = await repo.createOverride(base);
    return { id: o.id, effects };
  }

  if (input.choice === "SKIP" || input.choice === "SNOOZE") {
    const days = input.choice === "SKIP" ? 1 : (input.snoozeDays ?? 1);
    const until = addDaysToDate(now, days);
    if (decision?.unitId) {
      await repo.applyPlanItemUpdates(userId, [{ unitId: decision.unitId, patch: { snoozedUntil: until } }]);
      effects.push(`Set this unit aside for ${days} ${days === 1 ? "day" : "days"}.`);
    } else {
      effects.push(`Hiding this suggestion for ${days} ${days === 1 ? "day" : "days"}.`);
    }
    const o = await repo.createOverride({ ...base, snoozedUntil: until });
    return { id: o.id, effects };
  }

  // OVERRIDE: the student chose something else.
  let snapshot: { unitId: string; conceptIds: string[]; readiness: number | null } | null = null;
  if (input.moveOn && decision?.unitId) {
    const ctx = await buildContext(userId, now);
    const unit = ctx.out.units.find((u) => u.unitId === decision.unitId);
    if (unit) {
      const ids = ctx.out.exits[unit.unitId]?.unresolvedConceptIds ?? [];
      const conceptIds = ids.length ? ids : unit.weakConcepts.map((c) => c.conceptId);
      snapshot = { unitId: unit.unitId, conceptIds, readiness: ctx.out.exits[unit.unitId]?.readiness ?? null };
      await repo.applyPlanItemUpdates(userId, [
        { unitId: unit.unitId, patch: { status: "MOVED_ON", completedAt: now, exitReason: "USER_MOVED_ON", unresolved: { conceptIds, readiness: snapshot.readiness } } },
      ]);
      effects.push("Moved on. The weak concepts stay on your revision list.");
    }
  }

  if (input.chosenUnitId) {
    const ctx = await buildContext(userId, now);
    const chosen = ctx.out.units.find((u) => u.unitId === input.chosenUnitId);
    if (chosen && chosen.plan.status === "PENDING") {
      await repo.applyPlanItemUpdates(userId, [{ unitId: chosen.unitId, patch: { status: "ACTIVE", startedAt: now } }]);
      effects.push(`Started ${chosen.unitName}.`);
    }
  }

  const o = await repo.createOverride({ ...base, chosenUnitId: input.chosenUnitId ?? null, unresolvedSnapshot: snapshot });
  return { id: o.id, effects };
}
