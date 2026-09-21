/**
 * The planner's decision core — pure functions, no I/O.
 *
 *   Master Plan  = one PlanItem per unit, in syllabus order (persisted by the repository)
 *   Adaptive Plan = every unit's state re-evaluated against evidence (applyTransitions)
 *   Today's Target = the highest-priority candidate action (planToday)
 *
 * The LLM never appears here. A recommendation is a deterministic function of
 * signals, phase and time, so it can be replayed, tested and explained.
 */
import { clamp01, fracDays, round } from "./dates";
import { PLANNER_CONFIG } from "./planner.config";
import { computePriority, computeRevisionPriority, revisionUrgencyOf } from "./priority.service";
import { reasonsForPriority } from "./reasons";
import type {
  ActionStep,
  Candidate,
  ExitEvaluation,
  Phase,
  PhaseInfo,
  PlanItemPatch,
  PlanItemUpdate,
  PlannerAction,
  Reason,
  UnitSignals,
} from "./planner.types";
import { SETTLED_STATUSES } from "./planner.types";
import { evaluateExit } from "./unit-exit";

export interface PlanInput {
  now: Date;
  phase: PhaseInfo;
  units: UnitSignals[];
  flashcardsDue: number;
  conceptReviewsDue: number;
  lastMockAt: Date | null;
  /** Global actions the student snoozed today (flashcards, mock). */
  snoozedGlobals?: PlannerAction[];
  /** A unit the student explicitly chose today; it is shown first, the system pick moves to alternatives. */
  pinnedUnitId?: string | null;
}

export interface PlanOutput {
  primary: Candidate | null;
  alternatives: Candidate[];
  units: UnitSignals[];
  exits: Record<string, ExitEvaluation>;
  updates: PlanItemUpdate[];
  overallCoverage: number;
}

/* ------------------------------------------------------------------ */
/* Adaptive plan: state transitions                                    */
/* ------------------------------------------------------------------ */

export function applyTransitions(
  units: UnitSignals[],
  phase: Phase,
  now: Date,
): { units: UnitSignals[]; exits: Record<string, ExitEvaluation>; updates: PlanItemUpdate[] } {
  const out: UnitSignals[] = [];
  const exits: Record<string, ExitEvaluation> = {};
  const updates: PlanItemUpdate[] = [];

  for (const s0 of units) {
    const patch: PlanItemPatch = {};
    const plan = { ...s0.plan };

    if (plan.snoozedUntil && plan.snoozedUntil <= now) {
      plan.snoozedUntil = null;
      patch.snoozedUntil = null;
    }
    if (plan.status === "PENDING" && (s0.coverage > 0 || s0.attempts > 0)) {
      plan.status = "ACTIVE";
      plan.startedAt = now;
      patch.status = "ACTIVE";
      patch.startedAt = now;
    } else if (plan.status === "ACTIVE" && !plan.startedAt) {
      plan.startedAt = now;
      patch.startedAt = now;
    }

    let s: UnitSignals = { ...s0, plan };
    const exit = evaluateExit(s, now, phase);

    if (plan.status === "ACTIVE" && exit.state === "PROVISIONALLY_COMPLETE") {
      plan.status = "PROVISIONALLY_COMPLETE";
      plan.completedAt = now;
      plan.actualDays = round(exit.elapsedDays);
      Object.assign(patch, {
        status: plan.status,
        completedAt: now,
        actualDays: plan.actualDays,
        exitReason: "READY",
        unresolved: null,
      });
    } else if (plan.status === "ACTIVE" && exit.state === "GOOD_ENOUGH") {
      plan.status = "GOOD_ENOUGH";
      plan.completedAt = now;
      plan.actualDays = round(exit.elapsedDays);
      plan.unresolvedConceptIds = exit.unresolvedConceptIds;
      Object.assign(patch, {
        status: plan.status,
        completedAt: now,
        actualDays: plan.actualDays,
        exitReason: "MAX_EXTENSION",
        unresolved: { conceptIds: exit.unresolvedConceptIds, readiness: exit.readiness },
      });
    }

    s = { ...s, plan };
    out.push(s);
    exits[s.unitId] = exit;
    if (Object.keys(patch).length > 0) updates.push({ unitId: s.unitId, patch });
  }
  return { units: out, exits, updates };
}

/* ------------------------------------------------------------------ */
/* Candidate generation                                                */
/* ------------------------------------------------------------------ */

function practiceAction(s: UnitSignals): PlannerAction {
  const accs = [s.practiceAccuracy, s.recentAccuracy].filter((x): x is number => x != null);
  const acc = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : (s.mastery ?? 0.5);
  const [low, high] = PLANNER_CONFIG.actions.practiceBands;
  return acc < low ? "SOLVE_EASY" : acc < high ? "SOLVE_MEDIUM" : "SOLVE_HARD";
}

export function chooseAction(s: UnitSignals, exit: ExitEvaluation): PlannerAction {
  const a = PLANNER_CONFIG.actions;
  if (s.coverage < a.studyBelowCoverage) return "STUDY_CONCEPT";
  if (exit.readiness != null && s.attempts >= a.masteryCheckMinAttempts && exit.readiness >= exit.threshold - a.masteryCheckMargin) {
    return "TAKE_TOPIC_TEST";
  }
  if (s.openMistakes >= a.reviewMistakesMin) return "REVIEW_MISTAKES";
  return practiceAction(s);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function stepsFor(action: PlannerAction, s: UnitSignals, focus: string): ActionStep[] {
  const mistakes: ActionStep[] =
    s.openMistakes > 0 ? [{ label: `Review ${plural(Math.min(2, s.openMistakes), "previous mistake")}` }] : [];
  const tagStep: ActionStep = { label: "Tag every wrong answer with a mistake type" };
  switch (action) {
    case "STUDY_CONCEPT":
      return [{ label: `Study ${focus}` }, { label: "Solve 5 easy questions on it" }, tagStep];
    case "REVISE_CONCEPT":
      return [{ label: `Revise ${focus}` }, { label: "Solve 5 medium questions on it" }, ...mistakes, { label: "Take a 5-question check" }];
    case "SOLVE_EASY":
      return [{ label: `Rebuild the basics of ${focus}` }, { label: "Solve 8 easy questions" }, tagStep, ...mistakes];
    case "SOLVE_MEDIUM":
      return [{ label: `Review ${focus}` }, { label: "Solve 5 medium questions" }, ...mistakes, { label: "Take a 5-question check" }];
    case "SOLVE_HARD":
      return [{ label: "Solve 5 hard questions" }, tagStep, ...mistakes];
    case "REVIEW_MISTAKES":
      return [{ label: `Work through ${plural(Math.min(8, s.openMistakes), "open mistake")}` }, { label: "Mark each one resolved or keep it open" }];
    case "TAKE_TOPIC_TEST":
      return [{ label: "Take a 10-question mastery check" }, tagStep];
    case "TAKE_MINI_TEST":
      return [{ label: "Take a 10-question check quiz" }, { label: "Confirm or correct your reported coverage from the result" }];
    default:
      return [];
  }
}

function hrefFor(action: PlannerAction, s: UnitSignals): string {
  switch (action) {
    case "STUDY_CONCEPT":
      return `/syllabus/${s.subjectId}`;
    case "REVIEW_MISTAKES":
      return `/mistakes?unit=${s.unitId}`;
    case "FLASHCARD_REVIEW":
      return "/flashcards";
    case "TAKE_MOCK":
      return "/mocks";
    default:
      return `/practice/${s.unitId}`;
  }
}

function unitCandidate(
  s: UnitSignals,
  action: PlannerAction,
  priority: number,
  reasons: Reason[],
  focus: { conceptId: string; name: string } | null,
): Candidate {
  return {
    id: `${action}:${s.unitId}:${focus?.conceptId ?? ""}`,
    action,
    targetType: focus ? "CONCEPT" : "UNIT",
    unitId: s.unitId,
    unitName: s.unitName,
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    conceptId: focus?.conceptId ?? null,
    conceptName: focus?.name ?? null,
    priority: round(clamp01(priority), 4),
    reasons,
    steps: stepsFor(action, s, focus?.name ?? s.unitName),
    href: hrefFor(action, s),
    sequence: s.plan.sequence,
  };
}

function unitCandidates(
  s: UnitSignals,
  exit: ExitEvaluation,
  phase: Phase,
  now: Date,
  frontierId: string | null,
): Candidate[] {
  if (s.plan.snoozedUntil && s.plan.snoozedUntil > now) return [];
  const cfg = PLANNER_CONFIG;
  const status = s.plan.status;

  if (status === "PENDING") {
    if (s.unitId !== frontierId && phase < 3) return [];
    const p = computePriority(s, phase, now);
    const reasons = reasonsForPriority(s, p, 3);
    if (s.unitId === frontierId) reasons.unshift({ type: "NEXT_IN_SEQUENCE", value: 1 });
    return [unitCandidate(s, "STUDY_CONCEPT", p.score, reasons, s.uncovered[0] ?? null)];
  }

  if (status === "ACTIVE") {
    if (exit.state === "UNVERIFIED") {
      const priority = 0.35 + 0.4 * s.marksShare;
      return [
        unitCandidate(s, "TAKE_MINI_TEST", priority, [{ type: "UNVERIFIED_COVERAGE", value: s.coverage }, { type: "HIGH_MARKS_WEIGHT", value: s.marksShare }], null),
      ];
    }
    const p = computePriority(s, phase, now);
    let action = chooseAction(s, exit);
    let focus = action === "STUDY_CONCEPT" ? s.uncovered[0] : s.weakConcepts[0];
    let host = s;
    const reasons = reasonsForPriority(s, p, 4);

    // Failing a unit because a prerequisite is weak? Fix the prerequisite before harder questions (architecture §11).
    const blocker = s.prereqBlockers[0];
    if (blocker && s.prereqGap >= cfg.exit.prereqGapThreshold && (action === "SOLVE_MEDIUM" || action === "SOLVE_HARD" || action === "SOLVE_EASY")) {
      action = "REVISE_CONCEPT";
      focus = blocker;
      host = { ...s, unitId: blocker.unitId ?? s.unitId, unitName: blocker.unitName ?? s.unitName };
    }
    if (exit.elapsedDays > s.plan.targetDays) reasons.push({ type: "WITHIN_EXTENSION", value: exit.daysLeftInExtension });
    const bonus = cfg.continuityBonus[phase - 1] ?? 0;
    return [unitCandidate(host, action, p.score + bonus, reasons, focus ?? null)];
  }

  // Settled: PROVISIONALLY_COMPLETE | GOOD_ENOUGH | MOVED_ON | MASTERED
  if (!SETTLED_STATUSES.includes(status)) return [];
  const owes = (status === "MOVED_ON" || status === "GOOD_ENOUGH") && s.plan.unresolvedConceptIds.length > 0;
  const since = s.plan.completedAt ? fracDays(s.plan.completedAt, now) : Infinity;
  const owesDue = owes && (phase >= 3 || since >= cfg.unit.revisitAfterDays);
  if (revisionUrgencyOf(s, now) < cfg.actions.revisionMinUrgency && !owesDue) return [];

  const p = computePriority(s, phase, now);
  const reasons = reasonsForPriority(s, p, 3);
  if (owes) reasons.unshift({ type: "MOVED_ON_WEAKNESS", value: s.plan.unresolvedConceptIds.length });
  return [unitCandidate(s, "REVISE_CONCEPT", computeRevisionPriority(s, phase, now), reasons, s.weakConcepts[0] ?? null)];
}

function globalCandidates(input: PlanInput, phase: Phase, overallCoverage: number): Candidate[] {
  const a = PLANNER_CONFIG.actions;
  const snoozed = input.snoozedGlobals ?? [];
  const out: Candidate[] = [];
  const base = { targetType: "GLOBAL" as const, unitId: null, unitName: null, subjectId: null, subjectName: null, conceptId: null, conceptName: null, sequence: Number.MAX_SAFE_INTEGER };

  if (input.flashcardsDue >= a.flashcardsMinDue && !snoozed.includes("FLASHCARD_REVIEW")) {
    const priority = 0.25 + 0.6 * Math.min(1, input.flashcardsDue / a.flashcardsFullAt);
    out.push({
      ...base,
      id: "FLASHCARD_REVIEW:global",
      action: "FLASHCARD_REVIEW",
      priority: round(priority, 4),
      reasons: [{ type: "FLASHCARDS_DUE", value: input.flashcardsDue }],
      steps: [{ label: `Review ${plural(input.flashcardsDue, "due card")}` }],
      href: "/flashcards",
    });
  }

  const interval = a.mockIntervalDays[phase];
  if (interval && overallCoverage >= a.mockMinCoverage && !snoozed.includes("TAKE_MOCK")) {
    const since = input.lastMockAt ? fracDays(input.lastMockAt, input.now) : Infinity;
    if (since >= interval) {
      out.push({
        ...base,
        id: "TAKE_MOCK:global",
        action: "TAKE_MOCK",
        priority: phase === 4 ? 0.9 : 0.7,
        reasons: [{ type: "MOCK_DUE", value: Number.isFinite(since) ? since : -1 }],
        steps: [{ label: "Sit a full mock under exam conditions, on a laptop" }, { label: "Review every wrong and guessed question afterwards" }],
        href: "/mocks",
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Today's target                                                      */
/* ------------------------------------------------------------------ */

export function planToday(input: PlanInput): PlanOutput {
  const { now } = input;
  const phase = input.phase.phase;
  const { units, exits, updates } = applyTransitions(input.units, phase, now);

  const frontier =
    units
      .filter((u) => u.plan.status === "PENDING" && !(u.plan.snoozedUntil && u.plan.snoozedUntil > now))
      .sort((a, b) => a.plan.sequence - b.plan.sequence)[0]?.unitId ?? null;

  const overallCoverage = units.length ? units.reduce((a, u) => a + u.coverage, 0) / units.length : 0;

  const candidates: Candidate[] = [];
  for (const s of units) {
    const exit = exits[s.unitId];
    if (exit) candidates.push(...unitCandidates(s, exit, phase, now, frontier));
  }
  candidates.push(...globalCandidates(input, phase, overallCoverage));

  candidates.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence || a.id.localeCompare(b.id));

  if (input.pinnedUnitId) {
    const i = candidates.findIndex((c) => c.unitId === input.pinnedUnitId);
    if (i > 0) candidates.unshift(...candidates.splice(i, 1));
  }

  const primary = candidates[0] ?? null;
  const seenUnits = new Set<string | null>(primary ? [primary.unitId] : []);
  const alternatives: Candidate[] = [];
  for (const c of candidates.slice(1)) {
    if (c.unitId && seenUnits.has(c.unitId)) continue;
    if (c.unitId) seenUnits.add(c.unitId);
    alternatives.push(c);
    if (alternatives.length >= PLANNER_CONFIG.actions.maxAlternatives) break;
  }

  return { primary, alternatives, units, exits, updates, overallCoverage };
}

