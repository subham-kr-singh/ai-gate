/**
 * End-to-end check of the tutor's read path and confirm-then-apply write path
 * against a real database.
 *
 *   RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/tutor-flow.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "1";

describe.skipIf(!shouldRun)("tutor flow", () => {
  let db: typeof import("@/server/db/client").db;
  let buildTutorContext: typeof import("@/server/domains/tutor/tutor.context").buildTutorContext;
  let describeAction: typeof import("@/server/domains/tutor/tutor.actions").describeAction;
  let applyTutorAction: typeof import("@/server/domains/tutor/tutor.actions").applyTutorAction;
  let repo: typeof import("@/server/domains/planner/planner.repository");

  let userId: string;
  let unitId: string;

  beforeAll(async () => {
    ({ db } = await import("@/server/db/client"));
    ({ buildTutorContext } = await import("@/server/domains/tutor/tutor.context"));
    ({ describeAction, applyTutorAction } = await import("@/server/domains/tutor/tutor.actions"));
    repo = await import("@/server/domains/planner/planner.repository");

    const user = await db.user.create({ data: { email: `tutor-${Date.now()}@example.com` } });
    userId = user.id;

    const version = await db.syllabusVersion.create({ data: { label: `tutor-${Date.now()}`, isActive: false } });
    const subject = await db.subject.create({
      data: { syllabusVersionId: version.id, code: "TU", name: "Tutor Subject", order: 1 },
    });
    const unit = await db.unit.create({ data: { subjectId: subject.id, name: "Tutor Unit", order: 1 } });
    unitId = unit.id;

    // getOrCreatePlan + buildContext expect a plan to exist before PlanItems.
    await repo.getOrCreatePlan(userId, new Date());
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("builds a student snapshot the tutor can quote from", async () => {
    const ctx = await buildTutorContext(userId);
    expect(ctx.overview.totalUnits).toBeGreaterThanOrEqual(1);
    expect(ctx.overview.questionsLast7d).toBe(0);
    expect(Array.isArray(ctx.weakConcepts)).toBe(true);
    expect(ctx.generatedAt).toBeTruthy();
  });

  it("describes a reschedule without touching the plan", async () => {
    const before = await db.planItem.findFirst({ where: { userId, unitId } });
    const proposal = await describeAction(userId, {
      kind: "RESCHEDULE_UNIT",
      unitId,
      extendDays: 3,
    });
    expect(proposal.kind).toBe("RESCHEDULE_UNIT");
    expect(proposal.extendDays).toBe(3);
    expect(proposal.confirmLabel).toContain("3");

    const after = await db.planItem.findFirst({ where: { userId, unitId } });
    expect(after?.targetDays ?? null).toEqual(before?.targetDays ?? null);
  });

  it("applies a reschedule to the real plan and logs it", async () => {
    const before = await db.planItem.findFirst({ where: { userId, unitId } });
    expect(before).not.toBeNull();

    const result = await applyTutorAction(userId, {
      kind: "RESCHEDULE_UNIT",
      unitId,
      extendDays: 3,
      reason: "Felt low confidence in the tutor check-in.",
    });
    expect(result.applied).toBe(true);
    expect(result.effects.length).toBeGreaterThan(0);

    const after = await db.planItem.findFirst({ where: { userId, unitId } });
    expect(after!.targetDays).toBe(before!.targetDays + 3);

    const log = await db.tutorActionLog.findFirst({ where: { userId, unitId }, orderBy: { createdAt: "desc" } });
    expect(log?.kind).toBe("RESCHEDULE_UNIT");
    expect(log?.applied).toBe(true);
  });

  it("marks a unit incomplete without deleting its evidence", async () => {
    const result = await applyTutorAction(userId, { kind: "MARK_UNIT_INCOMPLETE", unitId });
    expect(result.applied).toBe(true);

    const item = await db.planItem.findFirst({ where: { userId, unitId } });
    expect(item!.status).toBe("ACTIVE");
    expect(item!.completedAt).toBeNull();
  });
});
