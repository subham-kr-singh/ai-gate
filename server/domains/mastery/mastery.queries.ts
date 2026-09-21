/** Read models for the dashboard. */
import { db as prisma } from "@/server/db/client";
import { getDueReviews } from "../revision/revision.service";
import * as lookup from "../syllabus/syllabus.lookup";
import { DEFAULT_COMPLETION_CONFIG } from "./completion.config";
import type { CompletionReason, UnitStatus } from "./completion.service";
import { DEFAULT_MASTERY_CONFIG } from "./mastery.config";
import { computeRetention } from "./mastery.math";
import { loadConceptStats } from "./mastery.repository";

const DAY = 86_400_000;

export interface Overview {
  totalUnits: number;
  unitsStarted: number;
  /** 0..1 mean unit coverage across ALL units (untouched units count as 0). */
  coverage: number;
  /** 0..1 mean unit mastery across ALL units. */
  mastery: number;
  reviewsDue: number;
  openMistakes: number;
  untaggedMistakes: number;
  weakUnitCount: number;
  weakConceptCount: number;
  questionsLast7d: number;
  questionsPrev7d: number;
  questionsLast24h: number;
}

export async function getOverview(userId: string, now = new Date()): Promise<Overview> {
  const cfg = DEFAULT_MASTERY_CONFIG;
  const since = (days: number) => new Date(now.getTime() - days * DAY);
  const [totalUnits, states, reviewsDue, openMistakes, untaggedMistakes, weakConceptCount, q7, qPrev, q24] = await Promise.all([
    lookup.countUnits(),
    prisma.learningState.findMany({ where: { userId }, select: { coverage: true, mastery: true, status: true } }),
    prisma.reviewState.count({ where: { userId, dueAt: { lte: now } } }),
    prisma.mistake.count({ where: { userId, resolved: false } }),
    prisma.mistake.count({ where: { userId, resolved: false, mistakeType: null } }),
    prisma.conceptStats.count({ where: { userId, mastery: { lt: cfg.weakBelow }, attempts: { gte: cfg.minAttemptsForWeakList } } }),
    prisma.appliedOutcome.count({ where: { userId, appliedAt: { gte: since(7) } } }),
    prisma.appliedOutcome.count({ where: { userId, appliedAt: { gte: since(14), lt: since(7) } } }),
    prisma.appliedOutcome.count({ where: { userId, appliedAt: { gte: since(1) } } }),
  ]);
  const denom = Math.max(1, totalUnits);
  return {
    totalUnits,
    unitsStarted: states.filter((s) => s.status !== "NOT_STARTED").length,
    coverage: states.reduce((s, r) => s + r.coverage, 0) / denom,
    mastery: states.reduce((s, r) => s + r.mastery, 0) / denom,
    reviewsDue,
    openMistakes,
    untaggedMistakes,
    weakUnitCount: states.filter((r) => r.status === "LEARNING" || r.status === "PRACTICING").length,
    weakConceptCount,
    questionsLast7d: q7,
    questionsPrev7d: qPrev,
    questionsLast24h: q24,
  };
}

export interface UnitProgress {
  unitId: string;
  unit: string;
  subjectId: string;
  subject: string;
  status: UnitStatus;
  readiness: number | null;
  coverage: number;
  mastery: number;
  pyqAccuracy: number | null;
  openMistakes: number;
  decision: string;
  reasons: CompletionReason[];
}

async function toProgress(rows: Awaited<ReturnType<typeof prisma.learningState.findMany>>): Promise<UnitProgress[]> {
  const labels = await lookup.getUnitLabels(rows.map((r) => r.unitId));
  return rows.map((r) => {
    const l = labels.get(r.unitId);
    return {
      unitId: r.unitId,
      unit: l?.unit ?? r.unitId,
      subjectId: l?.subjectId ?? "",
      subject: l?.subject ?? "",
      status: r.status as UnitStatus,
      readiness: r.readiness,
      coverage: r.coverage,
      mastery: r.mastery,
      pyqAccuracy: r.pyqAccuracy,
      openMistakes: r.openMistakes,
      decision: r.decision,
      reasons: (Array.isArray(r.reasons) ? r.reasons : []) as unknown as CompletionReason[],
    };
  });
}

/** Units that need work, weakest first. */
export async function getWeakUnitReport(userId: string, limit = 5): Promise<UnitProgress[]> {
  const rows = await prisma.learningState.findMany({
    where: { userId, status: { in: ["LEARNING", "PRACTICING", "REVISION_DUE"] } },
  });
  return (await toProgress(rows)).sort((a, b) => (a.readiness ?? 0) - (b.readiness ?? 0)).slice(0, limit);
}

/** Units in progress, most recently touched first ("Continue learning"). */
export async function getContinueLearning(userId: string, limit = 3): Promise<UnitProgress[]> {
  const rows = await prisma.learningState.findMany({
    where: { userId, status: { in: ["LEARNING", "PRACTICING", "REVISION_DUE"] } },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return toProgress(rows);
}

export interface WeakConcept {
  conceptId: string;
  name: string;
  mastery: number;
  retention: number | null;
  recentAccuracy: number | null;
  mistakes: number;
}

export async function getWeakConcepts(userId: string, limit = 8, now = new Date()): Promise<WeakConcept[]> {
  const cfg = DEFAULT_MASTERY_CONFIG;
  const rows = await prisma.conceptStats.findMany({
    where: { userId, mastery: { lt: cfg.weakBelow }, attempts: { gte: cfg.minAttemptsForWeakList } },
    orderBy: [{ mastery: "asc" }, { mistakes: "desc" }],
    take: limit,
  });
  const labels = await lookup.getConceptLabels(rows.map((r) => r.conceptId));
  return rows.flatMap((r) => {
    const l = labels.get(r.conceptId);
    if (!l || r.mastery === null) return [];
    return [{
      conceptId: r.conceptId,
      name: l.concept,
      mastery: r.mastery,
      retention: computeRetention(r.mastery, r.lastSeen, now, cfg),
      recentAccuracy: r.recentAccuracy,
      mistakes: r.mistakes,
    }];
  });
}

export interface PendingRevision {
  conceptId: string;
  name: string;
  retention: number | null;
}

/** Reviews that are due now, with live retention for the progress bar. */
export async function getPendingRevision(userId: string, limit = 4, now = new Date()): Promise<PendingRevision[]> {
  const due = await getDueReviews(userId, now, limit);
  const stats = await loadConceptStats(prisma, userId, due.map((d) => d.conceptId));
  return due.map((d) => {
    const s = stats.get(d.conceptId);
    return { conceptId: d.conceptId, name: d.concept, retention: s ? computeRetention(s.mastery, s.lastSeen, now) : null };
  });
}

export interface ConceptGateItem {
  conceptId: string;
  name: string;
  state: "MASTERED" | "IN_PROGRESS" | "NOT_STARTED" | "LOCKED";
  mastery: number | null;
  /** Name of the first prerequisite below the gate. */
  blockedBy?: string;
}

/**
 * Concept list for one unit. A concept with no evidence yet is LOCKED when a
 * prerequisite is below the gate (or has no evidence). Display only: nothing is blocked.
 */
export async function getConceptGate(userId: string, unitId: string): Promise<ConceptGateItem[]> {
  const gate = DEFAULT_MASTERY_CONFIG.prerequisiteGateAt;
  const concepts = await lookup.getUnitConcepts(unitId);
  const ids = concepts.map((c) => c.id);
  const stats = await loadConceptStats(prisma, userId, ids);
  const pairs = await lookup.getPrerequisitePairs(ids);
  const prereqIds = [...new Set(pairs.map((p) => p.prerequisiteId))];
  const prereqStats = await loadConceptStats(prisma, userId, prereqIds);
  const prereqLabels = await lookup.getConceptLabels(prereqIds);

  return concepts.map((c) => {
    const mastery = stats.get(c.id)?.mastery ?? null;
    const blocking = pairs
      .filter((p) => p.conceptId === c.id)
      .find((p) => (prereqStats.get(p.prerequisiteId)?.mastery ?? -1) < gate);
    if (mastery === null && blocking) {
      return { conceptId: c.id, name: c.name, state: "LOCKED" as const, mastery, blockedBy: prereqLabels.get(blocking.prerequisiteId)?.concept };
    }
    if (mastery === null) return { conceptId: c.id, name: c.name, state: "NOT_STARTED" as const, mastery };
    const state = mastery >= DEFAULT_COMPLETION_CONFIG.masteredCut ? "MASTERED" : "IN_PROGRESS";
    return { conceptId: c.id, name: c.name, state, mastery } as ConceptGateItem;
  });
}
