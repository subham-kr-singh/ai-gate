/**
 * Pure builder: raw rows (already fetched) -> UnitSignals.
 * No database access here; planner.repository.ts maps Prisma rows onto the Raw*
 * shapes below, so a schema mismatch is fixed in exactly one file.
 */
import { clamp01, fracDays } from "./dates";
import { PLANNER_CONFIG } from "./planner.config";
import type { ConceptSignal, DifficultyClass, PlanItemStatus, UnitPlanSignal, UnitSignals } from "./planner.types";

export interface RawConcept {
  id: string;
  name: string;
}
export interface RawUnit {
  id: string;
  name: string;
  subjectId: string;
  subjectName: string;
  /** Concepts in syllabus order. */
  concepts: RawConcept[];
}
export interface RawStats {
  conceptId: string;
  mastery: number;
  retention: number | null;
  completion: number;
  attempts: number;
  correct: number;
  mistakes: number;
  pyqAttempts: number;
  pyqCorrect: number;
  lastSeen: Date | null;
  nextReviewAt: Date | null;
}
export interface RawCoverage {
  unitId: string;
  status: string;
  pct: number | null;
}
export interface RawRecent {
  unitId: string;
  correct: number;
  total: number;
}
export interface RawDep {
  conceptId: string;
  prerequisiteId: string;
}
export interface RawPlanItem {
  unitId: string;
  sequence: number;
  status: PlanItemStatus;
  difficultyClass: DifficultyClass;
  targetDays: number;
  maxExtensionDays: number;
  startedAt: Date | null;
  completedAt: Date | null;
  actualDays: number | null;
  snoozedUntil: Date | null;
  revisionCount: number;
  lastRevisedAt: Date | null;
  nextRevisionAt: Date | null;
  unresolvedConceptIds: string[];
}
export interface RawInput {
  units: RawUnit[];
  stats: RawStats[];
  coverage: RawCoverage[];
  recent: RawRecent[];
  openMistakesByUnit: Record<string, number>;
  deps: RawDep[];
  pyqMarksByUnit: Record<string, number>;
  planItems: RawPlanItem[];
}

/** Exam-marks importance per unit, normalised so the largest is 1. */
export function computeMarksShare(units: RawUnit[], pyqMarksByUnit: Record<string, number>): Record<string, number> {
  const cfg = PLANNER_CONFIG.marks;
  const totalPyq = Object.values(pyqMarksByUnit).reduce((a, b) => a + b, 0);
  const raw: Record<string, number> = {};

  if (totalPyq >= cfg.minPyqMarksToTrust) {
    for (const u of units) raw[u.id] = pyqMarksByUnit[u.id] ?? 0;
  } else {
    const perSubject: Record<string, number> = {};
    for (const u of units) perSubject[u.subjectId] = (perSubject[u.subjectId] ?? 0) + 1;
    for (const u of units) {
      const hit = cfg.subjectFallback.find(([re]) => re.test(u.subjectName));
      raw[u.id] = (hit ? hit[1] : cfg.fallbackDefault) / perSubject[u.subjectId];
    }
  }
  const max = Math.max(0, ...Object.values(raw));
  const out: Record<string, number> = {};
  for (const u of units) out[u.id] = max > 0 ? raw[u.id] / max : 0;
  return out;
}

function reportedCoverage(c: RawCoverage | undefined): number {
  if (!c) return 0;
  const s = c.status.toUpperCase();
  if (["COMPLETED", "PROVISIONALLY_COMPLETE", "MASTERED", "REVISION_DUE"].includes(s)) return 1;
  if (s === "NOT_STARTED") return 0;
  if (c.pct != null) return clamp01(c.pct);
  return s === "PRACTICING" ? 0.8 : 0.3;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function buildUnitSignals(raw: RawInput, now: Date): UnitSignals[] {
  const statsBy = new Map(raw.stats.map((s) => [s.conceptId, s]));
  const covBy = new Map(raw.coverage.map((c) => [c.unitId, c]));
  const recentBy = new Map(raw.recent.map((r) => [r.unitId, r]));
  const itemBy = new Map(raw.planItems.map((p) => [p.unitId, p]));
  const marks = computeMarksShare(raw.units, raw.pyqMarksByUnit);

  const conceptInfo = new Map<string, ConceptSignal & { unitId: string; unitName: string }>();
  for (const u of raw.units)
    for (const c of u.concepts) {
      const st = statsBy.get(c.id);
      conceptInfo.set(c.id, {
        conceptId: c.id,
        name: c.name,
        mastery: st && st.attempts > 0 ? st.mastery : null,
        attempts: st?.attempts ?? 0,
        unitId: u.id,
        unitName: u.name,
      });
    }

  const depsBy = new Map<string, string[]>();
  const downstreamByUnit = new Map<string, number>();
  for (const d of raw.deps) {
    depsBy.set(d.conceptId, [...(depsBy.get(d.conceptId) ?? []), d.prerequisiteId]);
    const pre = conceptInfo.get(d.prerequisiteId);
    const dep = conceptInfo.get(d.conceptId);
    if (pre && dep && pre.unitId !== dep.unitId) {
      downstreamByUnit.set(pre.unitId, (downstreamByUnit.get(pre.unitId) ?? 0) + 1);
    }
  }
  const maxDownstream = Math.max(1, ...downstreamByUnit.values());

  const weakBelow = PLANNER_CONFIG.exit.weakConceptBelow;

  return raw.units.map((u, idx) => {
    const stats = u.concepts.map((c) => statsBy.get(c.id)).filter((x): x is RawStats => !!x);
    const touched = stats.filter((s) => s.attempts > 0);
    const attempts = stats.reduce((a, s) => a + s.attempts, 0);
    const correct = stats.reduce((a, s) => a + s.correct, 0);
    const pyqAttempts = stats.reduce((a, s) => a + s.pyqAttempts, 0);
    const pyqCorrect = stats.reduce((a, s) => a + s.pyqCorrect, 0);
    const completion = u.concepts.length
      ? u.concepts.reduce((a, c) => a + (statsBy.get(c.id)?.completion ?? 0), 0) / u.concepts.length
      : 0;
    const reported = reportedCoverage(covBy.get(u.id));

    const due = touched.filter((s) => s.nextReviewAt && s.nextReviewAt <= now);
    const overdue = due.map((s) => Math.max(0, fracDays(s.nextReviewAt as Date, now)));

    const withDeps = u.concepts.filter((c) => (depsBy.get(c.id) ?? []).length > 0);
    const blockers = new Map<string, ConceptSignal>();
    let shaky = 0;
    for (const c of withDeps) {
      let isShaky = false;
      for (const pid of depsBy.get(c.id) ?? []) {
        const p = conceptInfo.get(pid);
        if (p && p.mastery != null && p.mastery < 0.5) {
          isShaky = true;
          blockers.set(pid, p);
        }
      }
      if (isShaky) shaky++;
    }

    const rec = recentBy.get(u.id);
    const it = itemBy.get(u.id);
    const plan: UnitPlanSignal = {
      status: it?.status ?? "PENDING",
      sequence: it?.sequence ?? idx,
      difficultyClass: it?.difficultyClass ?? "MEDIUM",
      targetDays: it?.targetDays ?? PLANNER_CONFIG.unit.defaultTargetDays,
      maxExtensionDays: it?.maxExtensionDays ?? PLANNER_CONFIG.unit.defaultMaxExtensionDays,
      startedAt: it?.startedAt ?? null,
      completedAt: it?.completedAt ?? null,
      actualDays: it?.actualDays ?? null,
      snoozedUntil: it?.snoozedUntil ?? null,
      revisionCount: it?.revisionCount ?? 0,
      lastRevisedAt: it?.lastRevisedAt ?? null,
      nextRevisionAt: it?.nextRevisionAt ?? null,
      unresolvedConceptIds: it?.unresolvedConceptIds ?? [],
    };

    const weak = touched
      .filter((s) => s.mastery < weakBelow)
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 3)
      .map((s) => conceptInfo.get(s.conceptId) as ConceptSignal);

    const uncovered = u.concepts
      .filter((c) => (statsBy.get(c.id)?.completion ?? 0) < 1)
      .slice(0, 3)
      .map((c) => conceptInfo.get(c.id) as ConceptSignal);

    const seen = touched.map((s) => s.lastSeen).filter((d): d is Date => !!d);

    return {
      unitId: u.id,
      unitName: u.name,
      subjectId: u.subjectId,
      subjectName: u.subjectName,
      conceptCount: u.concepts.length,
      coverage: clamp01(Math.max(reported, completion)),
      mastery: mean(touched.map((s) => s.mastery)),
      attempts,
      correct,
      practiceAccuracy: attempts > 0 ? correct / attempts : null,
      recentAccuracy: rec && rec.total > 0 ? rec.correct / rec.total : null,
      recentAttempts: rec?.total ?? 0,
      pyqAttempts,
      pyqCorrect,
      pyqAccuracy: pyqAttempts > 0 ? pyqCorrect / pyqAttempts : null,
      mistakes: stats.reduce((a, s) => a + s.mistakes, 0),
      openMistakes: raw.openMistakesByUnit[u.id] ?? 0,
      retention: mean(touched.map((s) => s.retention).filter((r): r is number => r != null)),
      dueConceptCount: due.length,
      revisionDueShare: touched.length ? due.length / touched.length : 0,
      avgOverdueDays: mean(overdue) ?? 0,
      prereqGap: withDeps.length ? shaky / withDeps.length : 0,
      prereqImportance: (downstreamByUnit.get(u.id) ?? 0) / maxDownstream,
      prereqBlockers: [...blockers.values()].slice(0, 3),
      weakConcepts: weak,
      uncovered,
      lastPracticedAt: seen.length ? new Date(Math.max(...seen.map((d) => d.getTime()))) : null,
      marksShare: marks[u.id] ?? 0,
      plan,
    };
  });
}
