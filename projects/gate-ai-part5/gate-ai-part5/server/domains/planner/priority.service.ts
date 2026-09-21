/**
 * Marks-weighted priority engine (architecture §29).
 *
 *   priority = Σ weight[phase][k] * component[k]      (all components 0..1)
 *
 * Pure and deterministic: same signals + phase + time => same score, so every
 * recommendation can be reproduced from a stored PlannerDecision.
 */
import { clamp01, fracDays } from "./dates";
import { PHASE_WEIGHTS, PLANNER_CONFIG, PRIORITY_VERSION } from "./planner.config";
import type { Phase, PriorityKey, PriorityResult, UnitSignals } from "./planner.types";

export const PRIORITY_KEYS: PriorityKey[] = [
  "weakness",
  "importance",
  "remaining",
  "prereq",
  "mistakes",
  "revision",
  "recent",
];

export function normaliseWeights(w: Partial<Record<PriorityKey, number>>): Record<PriorityKey, number> {
  const total = PRIORITY_KEYS.reduce((a, k) => a + Math.max(0, w[k] ?? 0), 0);
  const out = {} as Record<PriorityKey, number>;
  for (const k of PRIORITY_KEYS) out[k] = total > 0 ? Math.max(0, w[k] ?? 0) / total : 1 / PRIORITY_KEYS.length;
  return out;
}

/** 1 - shrunken performance. Zero when the student has no performance evidence at all. */
export function weaknessOf(s: UnitSignals): number {
  const b = PLANNER_CONFIG.weaknessBlend;
  const parts: [number | null, number][] = [
    [s.mastery, b.mastery],
    [s.pyqAccuracy, b.pyq],
    [s.practiceAccuracy, b.practice],
  ];
  let wsum = 0;
  let psum = 0;
  for (const [v, w] of parts) {
    if (v != null) {
      wsum += w;
      psum += v * w;
    }
  }
  if (wsum === 0) return 0;
  const perf = psum / wsum;
  const n = s.attempts;
  const k = PLANNER_CONFIG.shrinkageK;
  return clamp01(1 - (perf * n + 0.5 * k) / (n + k));
}

export function revisionUrgencyOf(s: UnitSignals, now: Date): number {
  if (s.coverage <= 0) return 0;
  const b = PLANNER_CONFIG.revisionBlend;
  const overdue = Math.min(1, s.avgOverdueDays / 7);
  const nextRev = s.plan.nextRevisionAt;
  const ladder = nextRev && nextRev < now ? Math.min(1, fracDays(nextRev, now) / 5) : 0;
  const forgetting = s.retention != null ? 1 - s.retention : 0;
  return clamp01(b.dueShare * s.revisionDueShare + b.overdue * overdue + b.ladder * ladder + b.forgetting * forgetting);
}

export function priorityComponents(s: UnitSignals, now: Date): Record<PriorityKey, number> {
  const recent =
    s.recentAccuracy == null
      ? 0
      : (1 - s.recentAccuracy) * (s.recentAttempts / (s.recentAttempts + PLANNER_CONFIG.recentAttemptsHalfWeight));
  return {
    weakness: weaknessOf(s),
    importance: clamp01(s.marksShare),
    remaining: clamp01(1 - s.coverage),
    prereq: clamp01(0.5 * s.prereqImportance + 0.5 * s.prereqGap),
    mistakes: clamp01(s.mistakes / PLANNER_CONFIG.mistakeSaturation),
    revision: revisionUrgencyOf(s, now),
    recent: clamp01(recent),
  };
}

export function computePriority(
  s: UnitSignals,
  phase: Phase,
  now: Date,
  weightsOverride?: Partial<Record<PriorityKey, number>> | null,
): PriorityResult {
  const weights = weightsOverride ? normaliseWeights(weightsOverride) : PHASE_WEIGHTS[phase];
  const components = priorityComponents(s, now);
  const contributions = {} as Record<PriorityKey, number>;
  let score = 0;
  for (const k of PRIORITY_KEYS) {
    contributions[k] = weights[k] * components[k];
    score += contributions[k];
  }
  return { version: PRIORITY_VERSION, phase, score: clamp01(score), components, weights, contributions };
}

const REVISION_PHASE_FACTOR: Record<Phase, number> = { 1: 0.8, 2: 0.9, 3: 1, 4: 1 };

/**
 * Priority of *revisiting* a unit the student has already moved past.
 * Blends urgency, remaining weakness and exam importance. A unit the student
 * moved on from with unresolved weakness keeps a standing revision obligation.
 */
export function computeRevisionPriority(s: UnitSignals, phase: Phase, now: Date): number {
  const c = priorityComponents(s, now);
  let p = (0.5 * c.revision + 0.3 * c.weakness + 0.2 * c.importance) * REVISION_PHASE_FACTOR[phase];
  if (s.plan.status === "MOVED_ON" && s.plan.unresolvedConceptIds.length > 0) p += 0.1;
  return clamp01(p);
}
