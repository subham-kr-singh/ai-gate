/**
 * Pure mastery / retention math. No database, no framework imports, so it is
 * trivially unit-testable and safe to reuse from jobs.
 */
import { DEFAULT_MASTERY_CONFIG, type MasteryConfig } from "./mastery.config";

export type Confidence = 1 | 2 | 3 | 4;

export interface StatsSnapshot {
  /** 0..1 exposure to the material (not mastery). */
  completion: number;
  /** null until there is evidence. */
  mastery: number | null;
  retention: number | null;
  /** 0..1, normalised from the 1-4 self-confidence scale. */
  confidence: number | null;
  recentAccuracy: number | null;
  attempts: number;
  correct: number;
  /** Incorrect graded answers. */
  mistakes: number;
  averageTimeMs: number | null;
  lastSeen: Date | null;
  pyqAttempts: number;
  pyqCorrect: number;
}

export const EMPTY_STATS: StatsSnapshot = {
  completion: 0,
  mastery: null,
  retention: null,
  confidence: null,
  recentAccuracy: null,
  attempts: 0,
  correct: 0,
  mistakes: 0,
  averageTimeMs: null,
  lastSeen: null,
  pyqAttempts: 0,
  pyqCorrect: 0,
};

export interface AnswerOutcome {
  correct: boolean;
  isPyq: boolean;
  at: Date;
  timeMs?: number | null;
  confidence?: Confidence | null;
}

const MS_PER_DAY = 86_400_000;

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export const emaStep = (prev: number, result: number, alpha: number): number =>
  prev + alpha * (result - prev);

/** retention = mastery * exp(-days / tau). null when there is no evidence. */
export function computeRetention(
  mastery: number | null,
  lastSeen: Date | null,
  now: Date,
  cfg: MasteryConfig = DEFAULT_MASTERY_CONFIG,
): number | null {
  if (mastery === null || lastSeen === null) return null;
  const days = Math.max(0, (now.getTime() - lastSeen.getTime()) / MS_PER_DAY);
  return clamp01(mastery * Math.exp(-days / cfg.retentionTauDays));
}

/** One graded answer. */
export function applyAnswer(
  prev: StatsSnapshot | null,
  o: AnswerOutcome,
  cfg: MasteryConfig = DEFAULT_MASTERY_CONFIG,
): StatsSnapshot {
  const s = prev ?? EMPTY_STATS;
  const result = o.correct ? 1 : 0;
  const mastery = clamp01(emaStep(s.mastery ?? cfg.priorMastery, result, cfg.alpha));
  const recentAccuracy = clamp01(
    s.recentAccuracy === null ? result : emaStep(s.recentAccuracy, result, cfg.recentAlpha),
  );
  const attempts = s.attempts + 1;

  // Incremental mean. Callers are expected to pass timeMs for every graded answer.
  let averageTimeMs = s.averageTimeMs;
  if (o.timeMs != null && o.timeMs >= 0) {
    averageTimeMs =
      s.averageTimeMs === null ? o.timeMs : s.averageTimeMs + (o.timeMs - s.averageTimeMs) / attempts;
  }

  let confidence = s.confidence;
  if (o.confidence != null) {
    const c = (o.confidence - 1) / 3;
    confidence = confidence === null ? c : emaStep(confidence, c, cfg.confidenceAlpha);
  }

  return {
    completion: Math.max(s.completion, cfg.completionOnFirstAttempt),
    mastery,
    retention: computeRetention(mastery, o.at, o.at, cfg),
    confidence,
    recentAccuracy,
    attempts,
    correct: s.correct + (o.correct ? 1 : 0),
    mistakes: s.mistakes + (o.correct ? 0 : 1),
    averageTimeMs,
    lastSeen: o.at,
    pyqAttempts: s.pyqAttempts + (o.isPyq ? 1 : 0),
    pyqCorrect: s.pyqCorrect + (o.isPyq && o.correct ? 1 : 0),
  };
}

/**
 * A batch of self-reported results (Quick Study Report). Closed form of `n`
 * EMA steps at a constant accuracy `a`: m' = m + (1 - (1 - alpha)^n) * (a - m).
 * `weight` scales the batch (self-report counts for less than a graded answer).
 * Does NOT touch attempts/correct - those stay app-verified evidence.
 */
export function applyBatchEvidence(
  prev: StatsSnapshot | null,
  ev: { attempted: number; correct: number; weight: number },
  at: Date,
  cfg: MasteryConfig = DEFAULT_MASTERY_CONFIG,
): StatsSnapshot {
  const s = prev ?? EMPTY_STATS;
  if (ev.attempted <= 0 || ev.weight <= 0) return s;
  const n = ev.attempted * ev.weight;
  const a = clamp01(ev.correct / ev.attempted);
  const k = 1 - Math.pow(1 - cfg.alpha, n);
  const kRecent = 1 - Math.pow(1 - cfg.recentAlpha, n);
  const base = s.mastery ?? cfg.priorMastery;
  const mastery = clamp01(base + k * (a - base));
  const recentAccuracy = clamp01(
    s.recentAccuracy === null ? a : s.recentAccuracy + kRecent * (a - s.recentAccuracy),
  );
  return { ...s, mastery, recentAccuracy, lastSeen: at, retention: computeRetention(mastery, at, at, cfg) };
}

/** "I'm weak at this": one (configurable) incorrect observation. */
export function applyWeakFlag(
  prev: StatsSnapshot | null,
  at: Date,
  cfg: MasteryConfig = DEFAULT_MASTERY_CONFIG,
): StatsSnapshot {
  return applyBatchEvidence(prev, { attempted: cfg.weakFlagObservations, correct: 0, weight: 1 }, at, cfg);
}

/** Reported coverage: raises completion, never lowers it. */
export function markCovered(prev: StatsSnapshot | null, completion: number, at: Date): StatsSnapshot {
  const s = prev ?? EMPTY_STATS;
  return {
    ...s,
    completion: Math.max(s.completion, clamp01(completion)),
    lastSeen: at,
    retention: s.mastery,
  };
}
