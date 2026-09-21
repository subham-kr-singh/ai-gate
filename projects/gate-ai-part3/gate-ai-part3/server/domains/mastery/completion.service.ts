/**
 * Unit completion evaluator - pure and deterministic.
 * Coverage, mastery, practice/PYQ accuracy, recent performance, open mistakes
 * and prerequisite gaps go in; a status, a decision and machine-readable
 * reasons come out. "Days elapsed" is never an input.
 */
import { COMPLETION_VERSION, DEFAULT_COMPLETION_CONFIG, type CompletionConfig } from "./completion.config";

export type UnitStatus =
  | "NOT_STARTED"
  | "LEARNING"
  | "PRACTICING"
  | "PROVISIONALLY_COMPLETE"
  | "MASTERED"
  | "REVISION_DUE";

export interface UnitEvidence {
  conceptCount: number;
  /** 0..1 mean concept completion. */
  coverage: number;
  /** 0..1 mean concept mastery, unseen concepts counting as 0. */
  mastery: number;
  /** Weighted count of all questions (graded + self-reported * weight). */
  evidence: number;
  practiceAccuracy: number | null;
  practiceEvidence: number;
  pyqAccuracy: number | null;
  pyqEvidence: number;
  recentAccuracy: number | null;
  /** Mean live retention over concepts with evidence. */
  retention: number | null;
  openMistakes: number;
  prerequisiteGaps: number;
  /** The student's own "I want to continue this unit" from the latest report. */
  selfReportedContinue: boolean;
}

export interface CompletionReason {
  type: string;
  value: number | boolean;
}

export interface CompletionResult {
  status: UnitStatus;
  readiness: number | null;
  decision: "MOVE_ON" | "CONTINUE";
  reasons: CompletionReason[];
  version: string;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const round = (x: number, dp = 3) => Math.round(x * 10 ** dp) / 10 ** dp;

export function evaluateUnitCompletion(
  e: UnitEvidence,
  cfg: CompletionConfig = DEFAULT_COMPLETION_CONFIG,
  opts: { phase?: 1 | 2 | 3 | 4 } = {},
): CompletionResult {
  const version = COMPLETION_VERSION;
  if (e.coverage <= 0 && e.evidence <= 0) {
    return {
      status: "NOT_STARTED",
      readiness: null,
      decision: "CONTINUE",
      reasons: [{ type: "NO_ACTIVITY", value: true }],
      version,
    };
  }

  // Weighted readiness over the components that have enough evidence.
  const parts: { w: number; v: number }[] = [{ w: cfg.weights.mastery, v: e.mastery }];
  const practiceCounts = e.practiceAccuracy !== null && e.practiceEvidence >= cfg.minComponentEvidence;
  const pyqCounts = e.pyqAccuracy !== null && e.pyqEvidence >= cfg.minComponentEvidence;
  if (practiceCounts) parts.push({ w: cfg.weights.practice, v: e.practiceAccuracy as number });
  if (pyqCounts) parts.push({ w: cfg.weights.pyq, v: e.pyqAccuracy as number });
  if (e.recentAccuracy !== null) parts.push({ w: cfg.weights.recent, v: e.recentAccuracy });
  const wSum = parts.reduce((s, p) => s + p.w, 0);
  const base = parts.reduce((s, p) => s + p.w * p.v, 0) / wSum;

  const penalty =
    Math.min(cfg.penalties.maxOpenMistakes, e.openMistakes * cfg.penalties.perOpenMistake) +
    Math.min(cfg.penalties.maxPrerequisiteGaps, e.prerequisiteGaps * cfg.penalties.perPrerequisiteGap);
  const readiness = clamp01(base - penalty);

  const adj = opts.phase ? cfg.phaseCutAdjustment[opts.phase] : 0;
  const provisionalCut = cfg.provisionalCut + adj;
  const masteredCut = cfg.masteredCut + adj;

  const reasons: CompletionReason[] = [
    { type: "READINESS", value: round(readiness) },
    { type: "COVERAGE", value: round(e.coverage) },
    { type: "EVIDENCE", value: round(e.evidence, 1) },
  ];
  if (e.mastery < cfg.weakBelow) reasons.push({ type: "LOW_MASTERY", value: round(e.mastery) });
  if (practiceCounts && (e.practiceAccuracy as number) < cfg.weakBelow)
    reasons.push({ type: "LOW_PRACTICE_ACCURACY", value: round(e.practiceAccuracy as number) });
  if (pyqCounts && (e.pyqAccuracy as number) < cfg.weakBelow)
    reasons.push({ type: "LOW_PYQ_ACCURACY", value: round(e.pyqAccuracy as number) });
  if (e.recentAccuracy !== null && e.recentAccuracy < cfg.weakBelow)
    reasons.push({ type: "LOW_RECENT_ACCURACY", value: round(e.recentAccuracy) });
  if (e.openMistakes > cfg.masteredMaxOpenMistakes)
    reasons.push({ type: "OPEN_MISTAKES", value: e.openMistakes });
  if (e.prerequisiteGaps > 0) reasons.push({ type: "PREREQUISITE_GAPS", value: e.prerequisiteGaps });

  let status: UnitStatus;
  if (e.coverage < cfg.minCoverage) {
    status = "LEARNING";
    reasons.push({ type: "COVERAGE_BELOW_REQUIRED", value: cfg.minCoverage });
  } else if (e.evidence < cfg.minEvidence) {
    status = "PRACTICING";
    reasons.push({ type: "INSUFFICIENT_EVIDENCE", value: cfg.minEvidence });
  } else if (
    readiness >= masteredCut &&
    e.openMistakes <= cfg.masteredMaxOpenMistakes &&
    e.prerequisiteGaps === 0
  ) {
    status = "MASTERED";
  } else if (readiness >= provisionalCut) {
    status = "PROVISIONALLY_COMPLETE";
  } else {
    status = "PRACTICING";
  }

  if (
    (status === "MASTERED" || status === "PROVISIONALLY_COMPLETE") &&
    e.retention !== null &&
    e.retention < cfg.revisionDueRetention
  ) {
    status = "REVISION_DUE";
    reasons.push({ type: "LOW_RETENTION", value: round(e.retention) });
  }

  let decision: CompletionResult["decision"] =
    status === "LEARNING" || status === "PRACTICING" ? "CONTINUE" : "MOVE_ON";
  if (e.selfReportedContinue && decision === "MOVE_ON") {
    decision = "CONTINUE";
    reasons.push({ type: "USER_WANTS_TO_CONTINUE", value: true });
  }

  return { status, readiness: round(readiness), decision, reasons, version };
}
