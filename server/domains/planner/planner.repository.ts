/**
 * The ONLY planner file that reads tables owned by earlier Parts.
 *
 * Assumed shapes (from GATE_AI_ARCHITECTURE sections 18, 24, 70-72). If your
 * Part 1-3 schema names differ, fix the mapping here and nothing else moves:
 *
 *   Unit          { id, name, order, subject { id, name, order }, topics { order, concepts { id, name, order } } }
 *   ConceptStats  { userId, conceptId, mastery, retention, completion, attempts, correct, mistakes,
 *                   pyqAttempts, pyqCorrect, lastSeen, nextReviewAt }
 *   StudentCoverage { userId, unitId, status, coveragePct }
 *   Answer        { userId, correct, createdAt, question { unitId } }
 *   Mistake       { userId, unitId, resolvedAt }
 *   ConceptDependency { conceptId, prerequisiteId }
 *   Question      { unitId, marks, year, status }
 */
import { Prisma } from "@prisma/client";
import { db as prisma } from "@/server/db/client";
import { dayKey, keyToDate, addDaysToDate, type DayKey } from "./dates";
import { PLANNER_VERSION, PRIORITY_VERSION } from "./planner.config";
import type { Candidate, PlanItemUpdate, PlannerAction } from "./planner.types";
import type { RawInput, RawPlanItem, RawUnit } from "./signals";

export const DEFAULT_TIMEZONE = "Asia/Kolkata"; // GATE is held in India; editable per plan

/* ----------------------------- plan ------------------------------ */

export async function getOrCreatePlan(userId: string, now: Date) {
  const existing = await prisma.studyPlan.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.studyPlan.create({
      data: { userId, prepStartDate: keyToDate(dayKey(now, DEFAULT_TIMEZONE)), timezone: DEFAULT_TIMEZONE },
    });
  } catch (e) {
    // Two requests can race the find/create above. The unique index on
    // userId makes the loser fail — read back the winner's row instead.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const plan = await prisma.studyPlan.findUnique({ where: { userId } });
      if (plan) return plan;
    }
    throw e;
  }
}

export async function updatePlan(
  userId: string,
  data: Partial<{
    examDate: Date | null;
    prepStartDate: Date;
    timezone: string;
    targetDaysPerUnit: number;
    maxExtensionDays: number;
    phaseStarts: string[] | null;
    lastMockAt: Date;
    mocksCompleted: number;
  }>,
) {
  const { phaseStarts, ...rest } = data;
  return prisma.studyPlan.update({
    where: { userId },
    data: { ...rest, ...(phaseStarts !== undefined ? { phaseStarts: phaseStarts ?? Prisma.JsonNull } : {}) },
  });
}

export async function recordMock(userId: string, at: Date) {
  return prisma.studyPlan.update({ where: { userId }, data: { lastMockAt: at, mocksCompleted: { increment: 1 } } });
}

/* ------------------------- syllabus + evidence -------------------- */

async function loadUnits(): Promise<RawUnit[]> {
  const rows = await prisma.unit.findMany({
    orderBy: [{ subject: { order: "asc" } }, { order: "asc" }],
    select: {
      id: true,
      name: true,
      subject: { select: { id: true, name: true } },
      topics: { orderBy: { order: "asc" }, select: { concepts: { orderBy: { order: "asc" }, select: { id: true, name: true } } } },
    },
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    subjectId: u.subject.id,
    subjectName: u.subject.name,
    concepts: u.topics.flatMap((t) => t.concepts),
  }));
}

export async function ensurePlanItems(
  userId: string,
  plan: { id: string; targetDaysPerUnit: number; maxExtensionDays: number },
  units: RawUnit[],
) {
  const have = new Set((await prisma.planItem.findMany({ where: { userId }, select: { unitId: true } })).map((p) => p.unitId));
  const data = units
    .map((u, i) => ({ u, i }))
    .filter(({ u }) => !have.has(u.id))
    .map(({ u, i }) => ({
      planId: plan.id,
      userId,
      unitId: u.id,
      sequence: i,
      targetDays: plan.targetDaysPerUnit,
      maxExtensionDays: plan.maxExtensionDays,
      plannerVersion: PLANNER_VERSION,
    }));
  if (data.length) await prisma.planItem.createMany({ data, skipDuplicates: true });
}

function readUnresolved(json: Prisma.JsonValue | null): string[] {
  if (json && typeof json === "object" && !Array.isArray(json) && Array.isArray((json as { conceptIds?: unknown }).conceptIds)) {
    return ((json as { conceptIds: unknown[] }).conceptIds).filter((x): x is string => typeof x === "string");
  }
  return [];
}

export async function loadRaw(
  userId: string,
  plan: { id: string; targetDaysPerUnit: number; maxExtensionDays: number },
  now: Date,
): Promise<RawInput> {
  const units = await loadUnits();
  await ensurePlanItems(userId, plan, units);

  const since = addDaysToDate(now, -14);
  const [stats, coverage, answers, mistakes, deps, pyqMarks, items] = await Promise.all([
    prisma.conceptStats.findMany({ where: { userId } }),
    prisma.studentCoverage.findMany({ where: { userId } }),
    prisma.answer.findMany({ where: { userId, createdAt: { gte: since } }, select: { correct: true, question: { select: { unitId: true } } } }),
    prisma.mistake.groupBy({ by: ["unitId"], where: { userId, resolvedAt: null }, _count: { _all: true } }),
    prisma.conceptDependency.findMany({ select: { conceptId: true, prerequisiteId: true } }),
    prisma.question.groupBy({ by: ["unitId"], where: { year: { not: null }, status: "APPROVED" }, _sum: { marks: true } }),
    prisma.planItem.findMany({ where: { userId } }),
  ]);

  const recent = new Map<string, { correct: number; total: number }>();
  for (const a of answers) {
    const id = a.question.unitId;
    const cur = recent.get(id) ?? { correct: 0, total: 0 };
    recent.set(id, { correct: cur.correct + (a.correct === true ? 1 : 0), total: cur.total + 1 });
  }

  const planItems: RawPlanItem[] = items.map((p) => ({
    unitId: p.unitId,
    sequence: p.sequence,
    status: p.status,
    difficultyClass: p.difficultyClass,
    targetDays: p.targetDays,
    maxExtensionDays: p.maxExtensionDays,
    startedAt: p.startedAt,
    completedAt: p.completedAt,
    actualDays: p.actualDays,
    snoozedUntil: p.snoozedUntil,
    revisionCount: p.revisionCount,
    lastRevisedAt: p.lastRevisedAt,
    nextRevisionAt: p.nextRevisionAt,
    unresolvedConceptIds: readUnresolved(p.unresolved),
  }));

  return {
    units,
    stats: stats.map((s) => ({
      conceptId: s.conceptId,
      mastery: s.mastery,
      retention: s.retention,
      completion: s.completion,
      attempts: s.attempts,
      correct: s.correct,
      mistakes: s.mistakes,
      pyqAttempts: s.pyqAttempts,
      pyqCorrect: s.pyqCorrect,
      lastSeen: s.lastSeen,
      nextReviewAt: s.nextReviewAt,
    })),
    coverage: coverage.map((c) => ({ unitId: c.unitId, status: String(c.reportedStatus), pct: c.reportedPercent ?? null })),
    recent: [...recent].map(([unitId, v]) => ({ unitId, ...v })),
    openMistakesByUnit: Object.fromEntries(mistakes.map((m) => [m.unitId, m._count._all])),
    deps,
    pyqMarksByUnit: Object.fromEntries(pyqMarks.map((q) => [q.unitId, q._sum.marks ?? 0])),
    planItems,
  };
}

/* --------------------------- plan items --------------------------- */

export async function applyPlanItemUpdates(userId: string, updates: PlanItemUpdate[]) {
  if (!updates.length) return;
  await prisma.$transaction(
    updates.map(({ unitId, patch }) => {
      const { unresolved, ...rest } = patch;
      return prisma.planItem.update({
        where: { userId_unitId: { userId, unitId } },
        data: {
          ...rest,
          ...(unresolved !== undefined ? { unresolved: unresolved === null ? Prisma.JsonNull : unresolved } : {}),
          plannerVersion: PLANNER_VERSION,
        },
      });
    }),
  );
}

export async function updatePendingTargets(
  userId: string,
  targets: { unitId: string; targetDays: number; difficultyClass: "EASY" | "MEDIUM" | "HARD" }[],
) {
  await prisma.$transaction(
    targets.map((t) =>
      prisma.planItem.updateMany({
        where: { userId, unitId: t.unitId, status: "PENDING" },
        data: { targetDays: t.targetDays, difficultyClass: t.difficultyClass },
      }),
    ),
  );
}

export async function unitsClosedSince(userId: string, since: Date): Promise<string[]> {
  const rows = await prisma.planItem.findMany({
    where: { userId, completedAt: { gte: since }, status: { in: ["PROVISIONALLY_COMPLETE", "GOOD_ENOUGH", "MASTERED"] } },
    select: { unitId: true },
  });
  return rows.map((r) => r.unitId);
}

/* ------------------------- decisions/overrides -------------------- */

export async function saveDecision(
  userId: string,
  forKey: DayKey,
  d: {
    primary: Candidate;
    alternatives: Candidate[];
    phase: number;
    inputHash: string;
    beforeState: Prisma.InputJsonValue | null;
  },
): Promise<string> {
  const forDate = keyToDate(forKey);
  const row = await prisma.plannerDecision.upsert({
    where: { userId_forDate_inputHash: { userId, forDate, inputHash: d.inputHash } },
    create: {
      userId,
      forDate,
      action: d.primary.action,
      targetType: d.primary.targetType,
      unitId: d.primary.unitId,
      conceptId: d.primary.conceptId,
      priority: d.primary.priority,
      reasons: d.primary.reasons as unknown as Prisma.InputJsonValue,
      steps: d.primary.steps as unknown as Prisma.InputJsonValue,
      alternatives: d.alternatives.map((a) => ({ id: a.id, action: a.action, unitId: a.unitId, priority: a.priority })) as unknown as Prisma.InputJsonValue,
      phase: d.phase,
      inputHash: d.inputHash,
      priorityVersion: PRIORITY_VERSION,
      plannerVersion: PLANNER_VERSION,
      beforeState: d.beforeState ?? Prisma.JsonNull,
    },
    update: {},
    select: { id: true },
  });
  return row.id;
}

export async function getDecision(userId: string, id: string) {
  return prisma.plannerDecision.findFirst({ where: { id, userId } });
}

export async function overridesFor(userId: string, forKey: DayKey) {
  return prisma.userOverride.findMany({ where: { userId, forDate: keyToDate(forKey) }, orderBy: { createdAt: "asc" } });
}

export async function createOverride(data: {
  userId: string;
  forKey: DayKey;
  decisionId?: string | null;
  choice: "FOLLOW" | "OVERRIDE" | "SKIP" | "SNOOZE";
  recommendedAction?: PlannerAction | string | null;
  recommendedUnitId?: string | null;
  chosenUnitId?: string | null;
  reason?: string | null;
  snoozedUntil?: Date | null;
  unresolvedSnapshot?: Prisma.InputJsonValue | null;
}) {
  return prisma.userOverride.create({
    data: {
      userId: data.userId,
      forDate: keyToDate(data.forKey),
      decisionId: data.decisionId ?? null,
      choice: data.choice,
      recommendedAction: data.recommendedAction ?? null,
      recommendedUnitId: data.recommendedUnitId ?? null,
      chosenUnitId: data.chosenUnitId ?? null,
      reason: data.reason ?? null,
      snoozedUntil: data.snoozedUntil ?? null,
      unresolvedSnapshot: data.unresolvedSnapshot ?? Prisma.JsonNull,
    },
  });
}

/* ---------------------------- snapshots --------------------------- */

export async function upsertSnapshot(
  userId: string,
  kind: "DAILY" | "WEEKLY",
  key: DayKey,
  data: { phase: number; daysToExam: number | null; metrics: Prisma.InputJsonValue; report?: Prisma.InputJsonValue },
) {
  const capturedOn = keyToDate(key);
  return prisma.planSnapshot.upsert({
    where: { userId_kind_capturedOn: { userId, kind, capturedOn } },
    create: { userId, kind, capturedOn, phase: data.phase, daysToExam: data.daysToExam, metrics: data.metrics, report: data.report ?? Prisma.JsonNull },
    update: { phase: data.phase, daysToExam: data.daysToExam, metrics: data.metrics, ...(data.report ? { report: data.report } : {}) },
  });
}

/** Latest snapshot captured on or before `key` (metrics only). */
export async function snapshotOnOrBefore(userId: string, kind: "DAILY" | "WEEKLY", key: DayKey) {
  return prisma.planSnapshot.findFirst({
    where: { userId, kind, capturedOn: { lte: keyToDate(key) } },
    orderBy: { capturedOn: "desc" },
  });
}

export async function latestSnapshot(userId: string, kind: "DAILY" | "WEEKLY") {
  return prisma.planSnapshot.findFirst({ where: { userId, kind }, orderBy: { capturedOn: "desc" } });
}

/* ----------------------------- retention -------------------------- */

/** retention = mastery * exp(-daysSinceLastSeen / tau), in one statement (architecture section 15). */
export async function refreshRetention(userId: string, now: Date, tauDays: number): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "ConceptStats"
    SET "retention" = LEAST(1, GREATEST(0,
      "mastery" * EXP(-(EXTRACT(EPOCH FROM (${now}::timestamptz - "lastSeen")) / 86400.0) / ${tauDays}::float8)))
    WHERE "userId" = ${userId} AND "lastSeen" IS NOT NULL`;
}

export async function listUserIds(): Promise<string[]> {
  return (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);
}

export async function applyDefaultsToPendingItems(userId: string, targetDays: number, maxExtensionDays: number) {
  return prisma.planItem.updateMany({ where: { userId, status: "PENDING" }, data: { targetDays, maxExtensionDays } });
}
