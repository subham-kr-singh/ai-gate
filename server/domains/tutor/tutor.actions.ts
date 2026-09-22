/**
 * server/domains/tutor/tutor.actions.ts
 *
 * The tutor's write path. It cannot mutate learning state directly — it
 * proposes, the student confirms, and the confirmed proposal runs through the
 * same domain services the manual UI uses (architecture §Chatbot-to-Learning-
 * State Pipeline: "The chatbot must not directly mutate authoritative learning
 * data").
 *
 * The low-confidence flow the product asks for is `reschedule_unit`:
 *
 *   "I feel low confidence on DBMS unit 3" -> tutor reads real evidence ->
 *   proposes RESCHEDULE or MARK_INCOMPLETE -> student confirms -> applied here.
 *
 * Both outcomes are deliberately conservative: moving on never erases weak
 * concepts (they stay owed for revision, exactly like a manual override), and
 * marking incomplete only lowers the unit's plan status — it does not delete
 * evidence the student already earned.
 */

import { z } from "zod";
import { db } from "@/server/db/client";
import { addDaysToDate } from "@/server/domains/planner/dates";
import * as repo from "@/server/domains/planner/planner.repository";
import { recordOverride } from "@/server/domains/planner/override.service";
import { buildContext } from "@/server/domains/planner/planner.service";

export const TUTOR_ACTION_KINDS = ["RESCHEDULE_UNIT", "MARK_UNIT_INCOMPLETE", "START_UNIT", "SNOOZE_UNIT"] as const;
export type TutorActionKind = (typeof TUTOR_ACTION_KINDS)[number];

export const tutorActionSchema = z
  .object({
    kind: z.enum(TUTOR_ACTION_KINDS),
    unitId: z.string().min(1),
    /** For RESCHEDULE_UNIT: push the target out by this many days. */
    extendDays: z.number().int().min(1).max(30).optional(),
    /** For SNOOZE_UNIT: hide it for this many days. */
    snoozeDays: z.number().int().min(1).max(14).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "RESCHEDULE_UNIT" && !v.extendDays) {
      ctx.addIssue({ code: "custom", path: ["extendDays"], message: "Say how many days to push the unit out by." });
    }
    if (v.kind === "SNOOZE_UNIT" && !v.snoozeDays) {
      ctx.addIssue({ code: "custom", path: ["snoozeDays"], message: "Say how many days to set the unit aside for." });
    }
  });

export type TutorActionInput = z.infer<typeof tutorActionSchema>;

export interface TutorActionProposal {
  id: string;
  kind: TutorActionKind;
  unitId: string;
  title: string;
  detail: string;
  /** Human wording for the confirm button, e.g. "Reschedule by 3 days". */
  confirmLabel: string;
  effects: string[];
  /** Echoed back on confirm so the client posts an action the server accepts. */
  extendDays?: number;
  snoozeDays?: number;
}

export interface TutorActionResult {
  applied: boolean;
  effects: string[];
  unitId: string;
}

export class TutorActionError extends Error {
  constructor(public code: "UNKNOWN_UNIT" | "NOT_ELIGIBLE", message: string) {
    super(message);
  }
}

/** Snapshot of a unit as the planner sees it, used to build proposals. */
async function unitFacts(userId: string, unitId: string, now: Date) {
  const ctx = await buildContext(userId, now);
  const unit = ctx.out.units.find((u) => u.unitId === unitId);
  if (!unit) throw new TutorActionError("UNKNOWN_UNIT", "That unit is not part of your plan.");
  return {
    unit,
    readiness: ctx.out.exits[unitId]?.readiness ?? null,
    unresolvedConceptIds: ctx.out.exits[unitId]?.unresolvedConceptIds ?? unit.weakConcepts.map((c) => c.conceptId),
    previousKey: ctx.todayKey,
  };
}

/**
 * Turns a proposed change into plain-language copy. Called for both the
 * pending proposal and the applied result so the student sees the same wording
 * before and after confirming.
 */
export async function describeAction(userId: string, input: TutorActionInput, now = new Date()): Promise<TutorActionProposal> {
  const { unit, readiness } = await unitFacts(userId, input.unitId, now);
  const name = unit.unitName;
  const pct = readiness == null ? null : Math.round(readiness * 100);

  switch (input.kind) {
    case "RESCHEDULE_UNIT": {
      const days = input.extendDays!;
      return {
        id: crypto.randomUUID(),
        kind: input.kind,
        unitId: unit.unitId,
        title: `Reschedule ${name}`,
        detail:
          `${name} currently sits at ${unit.plan.targetDays} target day(s)` +
          `${pct == null ? "" : ` with readiness ${pct}%`}. Extending it by ${days} day(s) pushes the target out ` +
          `without deleting any work you have already done.`,
        confirmLabel: `Add ${days} day${days === 1 ? "" : "s"} to ${name}`,
        effects: [`Target for ${name} becomes ${unit.plan.targetDays + days} day(s).`],
        extendDays: days,
      };
    }
    case "MARK_UNIT_INCOMPLETE": {
      return {
        id: crypto.randomUUID(),
        kind: input.kind,
        unitId: unit.unitId,
        title: `Mark ${name} incomplete`,
        detail:
          `${name} is currently ${unit.plan.status}. Marking it incomplete keeps it active and keeps every open ` +
          `mistake and due review attached to it. Weak concepts stay owed for revision.`,
        confirmLabel: `Keep ${name} in progress`,
        effects: [`${name} stays active and its weak concepts remain on your revision list.`],
      };
    }
    case "START_UNIT": {
      return {
        id: crypto.randomUUID(),
        kind: input.kind,
        unitId: unit.unitId,
        title: `Start ${name}`,
        detail: `Make ${name} the unit you work on now instead of the recommended one.`,
        confirmLabel: `Start ${name}`,
        effects: [`${name} becomes active.`],
      };
    }
    case "SNOOZE_UNIT": {
      const days = input.snoozeDays!;
      return {
        id: crypto.randomUUID(),
        kind: input.kind,
        unitId: unit.unitId,
        title: `Set ${name} aside`,
        detail: `Hide ${name} from your plan for ${days} day(s). It is not marked complete and nothing is lost.`,
        confirmLabel: `Set ${name} aside for ${days} day(s)`,
        effects: [`${name} is hidden for ${days} day(s).`],
        snoozeDays: days,
      };
    }
  }
}

/**
 * Applies a confirmed proposal. Uses the planner's own override/plan-item
 * services so the result is identical to the student doing it by hand, and
 * logs the accepted action for audit.
 */
export async function applyTutorAction(
  userId: string,
  input: TutorActionInput,
  now = new Date(),
): Promise<TutorActionResult> {
  const parsed = tutorActionSchema.parse(input);
  const { unit } = await unitFacts(userId, parsed.unitId, now);
  const effects: string[] = [];

  if (parsed.kind === "RESCHEDULE_UNIT") {
    const days = parsed.extendDays!;
    await repo.updatePendingTargets(userId, [
      {
        unitId: unit.unitId,
        targetDays: unit.plan.targetDays + days,
        difficultyClass: unit.plan.difficultyClass ?? "MEDIUM",
      },
    ]);
    // Record it as a conscious decision, not a silent edit — the same path a
    // manual override takes, so the planner's history stays truthful.
    await recordOverride(
      userId,
      {
        choice: "OVERRIDE",
        chosenUnitId: unit.unitId,
        moveOn: false,
        reason: parsed.reason ?? `Rescheduled ${unit.unitName} by ${days} day(s) from the tutor.`,
      },
      now,
    );
    effects.push(`Target for ${unit.unitName} extended by ${days} day(s).`);
    effects.push("The unit stays active — keeping it moving rather than closing it.");
  }

  if (parsed.kind === "MARK_UNIT_INCOMPLETE") {
    await repo.applyPlanItemUpdates(userId, [
      {
        unitId: unit.unitId,
        patch: {
          status: "ACTIVE",
          completedAt: null,
          exitReason: "STUDENT_LOW_CONFIDENCE",
        },
      },
    ]);
    await recordOverride(
      userId,
      {
        choice: "OVERRIDE",
        chosenUnitId: unit.unitId,
        moveOn: false,
        reason: parsed.reason ?? `Marked ${unit.unitName} incomplete after a low-confidence check-in.`,
      },
      now,
    );
    effects.push(`${unit.unitName} is active again and will keep appearing in your plan.`);
    effects.push("Open mistakes and due reviews for it are untouched.");
  }

  if (parsed.kind === "START_UNIT") {
    await recordOverride(
      userId,
      {
        choice: "OVERRIDE",
        chosenUnitId: unit.unitId,
        moveOn: false,
        reason: parsed.reason ?? `Switched to ${unit.unitName} from the tutor.`,
      },
      now,
    );
    effects.push(`${unit.unitName} is now the unit you are working on.`);
  }

  if (parsed.kind === "SNOOZE_UNIT") {
    const days = parsed.snoozeDays!;
    await recordOverride(
      userId,
      { choice: "SNOOZE", chosenUnitId: unit.unitId, snoozeDays: days, reason: parsed.reason ?? `Set ${unit.unitName} aside from the tutor.` },
      now,
    );
    effects.push(`${unit.unitName} is hidden until ${addDaysToDate(now, days).toISOString().slice(0, 10)}.`);
  }

  await db.tutorActionLog.create({
    data: {
      userId,
      kind: parsed.kind,
      unitId: parsed.unitId,
      payload: parsed as never,
      applied: true,
      effects,
    },
  });

  return { applied: true, effects, unitId: parsed.unitId };
}

/** Recent accepted actions, shown in the tutor so the student can see the trail. */
export async function listRecentTutorActions(userId: string, limit = 5) {
  return db.tutorActionLog.findMany({
    where: { userId, applied: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
