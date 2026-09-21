/**
 * Good-enough progression rule (architecture "Maximum Unit Duration").
 *
 *   strong enough             -> PROVISIONALLY_COMPLETE
 *   improving but unfinished  -> CONTINUE, inside target + maximum extension
 *   maximum extension reached -> GOOD_ENOUGH, weak concepts go to revision
 *
 * "Planned days elapsed" alone never completes a unit; a unit with no evidence
 * at all is UNVERIFIED rather than complete.
 */
import { clamp01, fracDays } from "./dates";
import { EXIT_VERSION, PLANNER_CONFIG } from "./planner.config";
import type { ExitEvaluation, Phase, UnitSignals } from "./planner.types";

export function readinessOf(s: UnitSignals): number | null {
  const cfg = PLANNER_CONFIG.exit;
  if (s.attempts < cfg.minEvidenceAttempts) return null;
  const parts: [number | null, number][] = [
    [s.mastery, 0.4],
    [s.practiceAccuracy, 0.25],
    [s.pyqAccuracy, 0.25],
    [s.recentAccuracy, 0.1],
  ];
  let wsum = 0;
  let psum = 0;
  for (const [v, w] of parts) {
    if (v != null) {
      wsum += w;
      psum += v * w;
    }
  }
  if (wsum === 0) return null;
  let r = psum / wsum;
  r -= Math.min(cfg.mistakePenaltyCap, s.openMistakes * cfg.mistakePenaltyEach);
  if (s.prereqGap >= cfg.prereqGapThreshold) r -= cfg.prereqPenalty;
  return clamp01(r);
}

export function exitThreshold(phase: Phase): number {
  return PLANNER_CONFIG.exit.strongReadiness + PLANNER_CONFIG.exit.phaseAdjust[phase - 1];
}

export function evaluateExit(s: UnitSignals, now: Date, phase: Phase): ExitEvaluation {
  const cfg = PLANNER_CONFIG.exit;
  const plan = s.plan;
  const readiness = readinessOf(s);
  const threshold = exitThreshold(phase);
  const startedAt = plan.startedAt ?? now;
  const elapsedDays = Math.max(0, fracDays(startedAt, now));
  const cap = plan.targetDays + plan.maxExtensionDays;
  const daysLeftInExtension = Math.max(0, cap - elapsedDays);
  const improving =
    s.recentAccuracy != null && s.practiceAccuracy != null && s.recentAccuracy > s.practiceAccuracy + 0.05;
  const unresolved = s.weakConcepts
    .filter((c) => c.mastery != null && c.mastery < cfg.weakConceptBelow)
    .slice(0, 6)
    .map((c) => c.conceptId);

  const base = { version: EXIT_VERSION, readiness, threshold, elapsedDays, daysLeftInExtension, improving, unresolvedConceptIds: unresolved };

  if (plan.status === "PENDING" && s.coverage <= 0 && s.attempts === 0) {
    return { ...base, state: "NOT_STARTED" };
  }
  if (readiness == null) {
    // Reported as covered but nothing to back it up: ask for evidence instead of trusting the label.
    if (s.coverage >= PLANNER_CONFIG.actions.unverifiedCoverage) return { ...base, state: "UNVERIFIED" };
    return { ...base, state: elapsedDays >= cap ? "GOOD_ENOUGH" : "CONTINUE" };
  }
  if (readiness >= threshold && s.coverage >= cfg.minCoverage) return { ...base, state: "PROVISIONALLY_COMPLETE" };
  if (elapsedDays >= cap) return { ...base, state: "GOOD_ENOUGH" };
  return { ...base, state: "CONTINUE" };
}
