/**
 * Planner orchestration: load evidence -> pure decision core -> persist.
 * Everything here is idempotent, so GET /api/planner/today can be called any
 * number of times, and the daily job can run it too.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { buildEvidence, computePace, explainProgress, type EvidenceReport, type PaceReport, type WhyItem } from "../analytics/pace.service";
import { countDue } from "../flashcards/flashcard.service";
import { dayKey, keyToDate, utcKey, type DayKey } from "./dates";
import { UserInputError } from "./errors";
import { PLANNER_VERSION, PRIORITY_VERSION } from "./planner.config";
import { planToday, type PlanOutput } from "./planner.core";
import * as repo from "./planner.repository";
import type { Candidate, PhaseInfo, PlannerAction } from "./planner.types";
import { resolvePhase } from "./phase.service";
import { buildUnitSignals } from "./signals";
import { estimateVelocity, type VelocityModel } from "./velocity.service";
import type { WeeklyReport } from "./weekly";

type PlanRow = Awaited<ReturnType<typeof repo.getOrCreatePlan>>;

export interface PlanningContext {
  now: Date;
  plan: PlanRow;
  todayKey: DayKey;
  phase: PhaseInfo;
  out: PlanOutput;
  velocity: VelocityModel;
  pace: PaceReport;
  evidence: EvidenceReport;
  flashcardsDue: number;
}

function explicitStarts(json: unknown): [DayKey, DayKey, DayKey] | null {
  return Array.isArray(json) && json.length === 3 && json.every((x) => typeof x === "string") ? (json as [DayKey, DayKey, DayKey]) : null;
}

export async function buildContext(userId: string, now = new Date()): Promise<PlanningContext> {
  const plan = await repo.getOrCreatePlan(userId, now);
  const todayKey = dayKey(now, plan.timezone);
  const raw = await repo.loadRaw(userId, plan, now);
  const units = buildUnitSignals(raw, now);

  const prepStartKey = utcKey(plan.prepStartDate);
  const examKey = plan.examDate ? utcKey(plan.examDate) : null;
  const phase = resolvePhase({ todayKey, prepStartKey, examKey, explicitStarts: explicitStarts(plan.phaseStarts) });

  const [flashcardsDue, todays] = await Promise.all([countDue(userId, now), repo.overridesFor(userId, todayKey)]);
  const pinned = [...todays].reverse().find((o) => o.choice === "OVERRIDE" && o.chosenUnitId)?.chosenUnitId ?? null;
  const globals: PlannerAction[] = ["FLASHCARD_REVIEW", "TAKE_MOCK"];
  const snoozedGlobals = todays
    .filter((o) => (o.choice === "SKIP" || o.choice === "SNOOZE") && o.snoozedUntil && o.snoozedUntil > now)
    .map((o) => o.recommendedAction as PlannerAction)
    .filter((a) => globals.includes(a));

  const out = planToday({
    now,
    phase,
    units,
    flashcardsDue,
    conceptReviewsDue: units.reduce((a, u) => a + u.dueConceptCount, 0),
    lastMockAt: plan.lastMockAt,
    snoozedGlobals,
    pinnedUnitId: pinned,
  });
  await repo.applyPlanItemUpdates(userId, out.updates);

  const velocity = estimateVelocity(
    out.units
      .filter((u) => (u.plan.actualDays ?? 0) > 0 && ["PROVISIONALLY_COMPLETE", "GOOD_ENOUGH", "MASTERED"].includes(u.plan.status))
      .map((u) => ({ subjectId: u.subjectId, difficultyClass: u.plan.difficultyClass, actualDays: u.plan.actualDays as number })),
  );
  const pace = computePace({ todayKey, prepStartKey, examKey, phase, units: out.units, velocity });
  const evidence = buildEvidence(out.units, plan.mocksCompleted);
  return { now, plan, todayKey, phase, out, velocity, pace, evidence, flashcardsDue };
}

/* ------------------------------ today ------------------------------ */

export interface TodayView {
  forDate: DayKey;
  needsSetup: boolean;
  phase: PhaseInfo;
  primary: Candidate | null;
  alternatives: Candidate[];
  decisionId: string | null;
  pace: PaceReport;
  evidence: EvidenceReport;
  due: { flashcards: number; conceptReviews: number };
  velocity: { averageDays: number | null; sampleCount: number };
  needsAttention: { unitId: string; unitName: string; subjectName: string; mastery: number }[];
  /** Coverage and mastery for units named in primary/alternatives, for progress bars. */
  unitProgress: Record<string, { coverage: number; mastery: number | null }>;
  /** Every unit, for the "do something else" picker. */
  unitOptions: { unitId: string; unitName: string; subjectName: string }[];
  versions: { planner: string; priority: string };
}

const hash = (c: Candidate, phase: number) =>
  createHash("sha1").update(`${c.action}|${c.unitId}|${c.conceptId}|${c.priority.toFixed(2)}|${phase}`).digest("hex").slice(0, 16);

export async function getToday(userId: string, now = new Date()): Promise<TodayView> {
  const ctx = await buildContext(userId, now);
  const { out, phase } = ctx;

  let decisionId: string | null = null;
  if (out.primary) {
    const u = out.primary.unitId ? out.units.find((x) => x.unitId === out.primary?.unitId) : undefined;
    decisionId = await repo.saveDecision(userId, ctx.todayKey, {
      primary: out.primary,
      alternatives: out.alternatives,
      phase: phase.phase,
      inputHash: hash(out.primary, phase.phase),
      beforeState: u
        ? { coverage: u.coverage, mastery: u.mastery, pyqAccuracy: u.pyqAccuracy, recentAccuracy: u.recentAccuracy, openMistakes: u.openMistakes }
        : null,
    });
  }

  const unitProgress: TodayView["unitProgress"] = {};
  for (const c of [out.primary, ...out.alternatives]) {
    const u = c?.unitId ? out.units.find((x) => x.unitId === c.unitId) : undefined;
    if (u && c?.unitId) unitProgress[c.unitId] = { coverage: u.coverage, mastery: u.mastery };
  }

  const needsAttention = out.units
    .filter((u) => u.mastery != null && u.attempts >= 5)
    .sort((a, b) => (a.mastery as number) - (b.mastery as number))
    .filter((u) => (u.mastery as number) < 0.7)
    .slice(0, 3)
    .map((u) => ({ unitId: u.unitId, unitName: u.unitName, subjectName: u.subjectName, mastery: u.mastery as number }));

  return {
    forDate: ctx.todayKey,
    needsSetup: !ctx.plan.examDate,
    phase,
    primary: out.primary,
    alternatives: out.alternatives,
    decisionId,
    pace: ctx.pace,
    evidence: ctx.evidence,
    due: { flashcards: ctx.flashcardsDue, conceptReviews: out.units.reduce((a, u) => a + u.dueConceptCount, 0) },
    velocity: { averageDays: ctx.velocity.averageDays, sampleCount: ctx.velocity.sampleCount },
    needsAttention,
    unitProgress,
    unitOptions: out.units.map((u) => ({ unitId: u.unitId, unitName: u.unitName, subjectName: u.subjectName })),
    versions: { planner: PLANNER_VERSION, priority: PRIORITY_VERSION },
  };
}

/* ----------------------------- settings ---------------------------- */

const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.");

export const planSettingsSchema = z
  .object({
    examDate: dayKeySchema.nullable(),
    prepStartDate: dayKeySchema,
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone."),
    targetDaysPerUnit: z.number().min(0.5).max(5),
    maxExtensionDays: z.number().min(0).max(7),
    phaseStarts: z.tuple([dayKeySchema, dayKeySchema, dayKeySchema]).nullable(),
  })
  .partial()
  .superRefine((v, ctx) => {
    if (v.examDate && v.prepStartDate && v.examDate <= v.prepStartDate) {
      ctx.addIssue({ code: "custom", path: ["examDate"], message: "The exam date must come after your preparation start date." });
    }
  });

export async function getPlanSettings(userId: string, now = new Date()) {
  const p = await repo.getOrCreatePlan(userId, now);
  return {
    examDate: p.examDate ? utcKey(p.examDate) : null,
    prepStartDate: utcKey(p.prepStartDate),
    timezone: p.timezone,
    targetDaysPerUnit: p.targetDaysPerUnit,
    maxExtensionDays: p.maxExtensionDays,
    phaseStarts: explicitStarts(p.phaseStarts),
  };
}

export async function updatePlanSettings(userId: string, input: z.infer<typeof planSettingsSchema>, now = new Date()) {
  const current = await repo.getOrCreatePlan(userId, now);
  const exam = input.examDate === undefined ? (current.examDate ? utcKey(current.examDate) : null) : input.examDate;
  const start = input.prepStartDate ?? utcKey(current.prepStartDate);
  if (exam && exam <= start) throw new UserInputError("The exam date must come after your preparation start date.", "examDate");

  await repo.updatePlan(userId, {
    ...(input.examDate !== undefined ? { examDate: input.examDate ? keyToDate(input.examDate) : null } : {}),
    ...(input.prepStartDate ? { prepStartDate: keyToDate(input.prepStartDate) } : {}),
    ...(input.timezone ? { timezone: input.timezone } : {}),
    ...(input.targetDaysPerUnit != null ? { targetDaysPerUnit: input.targetDaysPerUnit } : {}),
    ...(input.maxExtensionDays != null ? { maxExtensionDays: input.maxExtensionDays } : {}),
    ...(input.phaseStarts !== undefined ? { phaseStarts: input.phaseStarts } : {}),
  });
  // New soft targets apply to units the student has not started; started units keep the clock they began with.
  if (input.targetDaysPerUnit != null || input.maxExtensionDays != null) {
    await repo.applyDefaultsToPendingItems(userId, input.targetDaysPerUnit ?? current.targetDaysPerUnit, input.maxExtensionDays ?? current.maxExtensionDays);
  }
  return getPlanSettings(userId, now);
}

/** Part 6 calls this when a mock is submitted so the planner can pace the next one. */
export async function recordMockCompleted(userId: string, at = new Date()) {
  await repo.getOrCreatePlan(userId, at);
  return repo.recordMock(userId, at);
}

/* ------------------------------ reports ---------------------------- */

export interface ProgressReports {
  forDate: DayKey;
  phase: PhaseInfo;
  pace: PaceReport;
  evidence: EvidenceReport;
  why: WhyItem[];
  weekly: { capturedOn: DayKey; report: WeeklyReport } | null;
  velocity: { averageDays: number | null; sampleCount: number };
  needsSetup: boolean;
}

export async function getProgressReports(userId: string, now = new Date()): Promise<ProgressReports> {
  const ctx = await buildContext(userId, now);
  const snap = await repo.latestSnapshot(userId, "WEEKLY");
  return {
    forDate: ctx.todayKey,
    phase: ctx.phase,
    pace: ctx.pace,
    evidence: ctx.evidence,
    why: explainProgress(ctx.out.units, ctx.out.exits, ctx.velocity),
    weekly: snap?.report ? { capturedOn: utcKey(snap.capturedOn), report: snap.report as unknown as WeeklyReport } : null,
    velocity: { averageDays: ctx.velocity.averageDays, sampleCount: ctx.velocity.sampleCount },
    needsSetup: !ctx.plan.examDate,
  };
}

