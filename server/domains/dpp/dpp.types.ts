import type { DPPSource } from "./dpp.config";

/**
 * A question as it's fetched from a candidate-source query, before it's
 * been slotted into a DPP. Deliberately narrow — the composer only needs
 * enough to dedupe and order, not the full Question record.
 */
export interface DPPCandidateQuestion {
  questionId: string;
  conceptId: string | null;
}

/** One candidate-source query's results, ranked best-first by that source's own criteria. */
export type DPPCandidatePool = Record<DPPSource, DPPCandidateQuestion[]>;

/** A question after the composer has placed it into the DPP. */
export interface ComposedDPPQuestion {
  questionId: string;
  conceptId: string | null;
  source: DPPSource;
  position: number;
}

/** A composed question as returned to callers, with completion state from the DPPQuestion row. */
export interface DPPQuestionWithProgress extends ComposedDPPQuestion {
  completedAt: Date | null;
  correct: boolean | null;
}

export interface ComposeDPPResult {
  questions: ComposedDPPQuestion[];
  /** True if every bucket's target count was met (with or without backfill). */
  fullyFilled: boolean;
  /** How many slots, if any, could not be filled by any source (candidate pool exhausted). */
  shortfall: number;
}

export interface GenerateDPPParams {
  userId: string;
  /** Calendar day the DPP is for, at UTC midnight. */
  date: Date;
}

export interface GenerateDPPResult {
  dppId: string;
  date: string; // ISO date, e.g. "2026-09-19"
  algorithmVersion: string;
  /** False if today's DPP already existed and this call just returned it. */
  createdNew: boolean;
  questions: DPPQuestionWithProgress[];
}
