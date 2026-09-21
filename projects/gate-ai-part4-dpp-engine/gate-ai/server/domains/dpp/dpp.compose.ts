import { DPP_SOURCES, type DPPConfig, type DPPSource } from "./dpp.config";
import type {
  ComposeDPPResult,
  ComposedDPPQuestion,
  DPPCandidatePool,
  DPPCandidateQuestion,
} from "./dpp.types";

/**
 * Pure, deterministic DPP composition. Given each source bucket's
 * candidates (already fetched, already ranked best-first) and a config,
 * produce the final ordered question list.
 *
 * Kept free of any DB/Prisma import on purpose: dpp.service.ts does the
 * fetching and calls this; dpp.test.ts exercises this directly with
 * hand-built candidate pools, so proportion and no-duplicate behavior is
 * tested without a database.
 *
 * Rules:
 *   1. Each source contributes up to config.proportions[source] questions,
 *      taken in the order the candidates were supplied (callers rank by
 *      their own relevance — e.g. lowest mastery first for WEAK).
 *   2. A question already selected by an earlier bucket is skipped
 *      wherever else it appears — the same question never appears twice
 *      in one DPP, even if multiple sources surfaced it.
 *   3. If a bucket can't fill its quota (candidates exhausted), the
 *      shortfall is carried forward and filled from config.backfillOrder,
 *      trying each source's *remaining* (not-yet-used) candidates in turn.
 *   4. If every pool is exhausted before targetCount is reached, the
 *      result is short — composeDPP reports this via `shortfall` rather
 *      than silently padding with duplicates or failing.
 */
export function composeDPP(pool: DPPCandidatePool, config: DPPConfig): ComposeDPPResult {
  const selected: ComposedDPPQuestion[] = [];
  const usedQuestionIds = new Set<string>();

  // Tracks how far into each source's candidate array we've already
  // consumed, so backfill can continue from where the primary pass left
  // off instead of re-offering (and re-skipping) the same candidates.
  const cursor: Record<DPPSource, number> = {
    WEAK: 0,
    PREREQUISITE: 0,
    REVISION: 0,
    MISTAKE: 0,
    PYQ: 0,
    MIXED: 0,
  };

  function takeFrom(source: DPPSource, count: number): DPPCandidateQuestion[] {
    const candidates = pool[source] ?? [];
    const taken: DPPCandidateQuestion[] = [];
    while (taken.length < count && cursor[source] < candidates.length) {
      const candidate = candidates[cursor[source]];
      cursor[source] += 1;
      if (usedQuestionIds.has(candidate.questionId)) continue; // dedupe across buckets
      usedQuestionIds.add(candidate.questionId);
      taken.push(candidate);
    }
    return taken;
  }

  // Pass 1 — primary quota per source, in canonical source order.
  for (const source of DPP_SOURCES) {
    const quota = config.proportions[source];
    if (quota <= 0) continue;
    const taken = takeFrom(source, quota);
    for (const candidate of taken) {
      selected.push({
        questionId: candidate.questionId,
        conceptId: candidate.conceptId,
        source,
        position: 0, // assigned after composition is final
      });
    }
  }

  // Pass 2 — backfill any shortfall using config.backfillOrder, each
  // source's still-unconsumed candidates only.
  let remainingShortfall = config.targetCount - selected.length;
  for (const source of config.backfillOrder) {
    if (remainingShortfall <= 0) break;
    const taken = takeFrom(source, remainingShortfall);
    for (const candidate of taken) {
      selected.push({
        questionId: candidate.questionId,
        conceptId: candidate.conceptId,
        // Backfilled questions are tagged MIXED so the "why is this here"
        // UI doesn't claim a false reason (e.g. a WEAK-quota slot filled
        // by a PYQ candidate isn't actually about weakness).
        source: "MIXED",
        position: 0,
      });
    }
    remainingShortfall -= taken.length;
  }

  const finalShortfall = Math.max(0, config.targetCount - selected.length);

  return {
    questions: selected.map((q, index) => ({ ...q, position: index + 1 })),
    // "Fully filled" means the final set reached targetCount, whether that
    // took primary-bucket picks, backfill, or both — a bucket falling
    // short on its own (e.g. nothing due for revision today) isn't a
    // problem as long as backfill made the student a complete set.
    fullyFilled: finalShortfall === 0,
    shortfall: finalShortfall,
  };
}
