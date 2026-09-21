/**
 * Orchestrates learning-state updates. Pure math lives in mastery.math.ts and
 * completion.service.ts; this file only loads, calls them and saves.
 *
 * Part 2 hook: call recordAnswers() after grading a submitted test/quiz.
 */
import { prisma } from "@/server/db/client";
import type { Db } from "../shared/db";
import { track } from "../analytics/analytics.service";
import { autoResolveForQuestion, countOpenMistakes, createUntaggedMistake } from "../mistakes/mistake.repository";
import { applyReviewOutcome } from "../revision/revision.service";
import * as lookup from "../syllabus/syllabus.lookup";
import { DEFAULT_COMPLETION_CONFIG, type CompletionConfig } from "./completion.config";
import { evaluateUnitCompletion, type CompletionResult, type UnitEvidence } from "./completion.service";
import { DEFAULT_MASTERY_CONFIG, type MasteryConfig } from "./mastery.config";
import { applyAnswer, computeRetention, type Confidence } from "./mastery.math";
import * as repo from "./mastery.repository";

export interface RecordedAnswer {
  /** Part 2's Answer.id - used for idempotency. */
  answerId: string;
  questionId: string;
  /** Optional; looked up from QuestionConcept when omitted. */
  conceptIds?: string[];
  /** Fallback unit for questions with no concept mapping yet. */
  unitId?: string | null;
  correct: boolean;
  isPyq: boolean;
  timeMs?: number | null;
  confidence?: Confidence | null;
  answeredAt?: Date;
}

/**
 * Applies graded answers to concept/topic stats, review dates, mistakes and
 * unit state - once per answerId. Only pass ANSWERED questions: an unanswered
 * question is not evidence of anything.
 */
export async function recordAnswers(
  userId: string,
  answers: RecordedAnswer[],
  cfg: MasteryConfig = DEFAULT_MASTERY_CONFIG,
  now: Date = new Date(),
): Promise<{ applied: number; skipped: number; unitsUpdated: string[] }> {
  return prisma.$transaction(
    async (tx) => {
      let applied = 0;
      let skipped = 0;
      const units = new Set<string>();

      for (const a of answers) {
        if (!(await repo.markOutcomeApplied(tx, userId, a.answerId))) {
          skipped++;
          continue;
        }
        const at = a.answeredAt ?? now;
        const conceptIds =
          a.conceptIds ?? (await lookup.getQuestionConceptIds([a.questionId], tx)).get(a.questionId) ?? [];
        const placements = await lookup.getConceptPlacements(conceptIds, tx);
        const outcome = { correct: a.correct, isPyq: a.isPyq, at, timeMs: a.timeMs, confidence: a.confidence };

        const prevConcepts = await repo.loadConceptStats(tx, userId, conceptIds);
        for (const cid of conceptIds) {
          await repo.saveConceptStats(tx, userId, cid, applyAnswer(prevConcepts.get(cid) ?? null, outcome, cfg));
        }

        const topicIds = [...new Set([...placements.values()].map((p) => p.topicId))];
        const prevTopics = await repo.loadTopicStats(tx, userId, topicIds);
        for (const tid of topicIds) {
          await repo.saveTopicStats(tx, userId, tid, applyAnswer(prevTopics.get(tid) ?? null, outcome, cfg));
        }

        await applyReviewOutcome(tx, userId, conceptIds, a.correct, at);

        const primary = [...placements.values()][0];
        for (const p of placements.values()) units.add(p.unitId);
        if (!primary && a.unitId) units.add(a.unitId);

        if (!a.correct) {
          const m = await createUntaggedMistake(tx, {
            userId,
            answerId: a.answerId,
            questionId: a.questionId,
            unitId: primary?.unitId ?? a.unitId ?? null,
            topicId: primary?.topicId ?? null,
            conceptIds,
          });
          if (m.created) await track(tx, userId, "MISTAKE_CREATED", { mistakeId: m.id });
        } else if (a.confidence !== 1) {
          // A guessed-correct answer (confidence 1) does not close a mistake.
          await autoResolveForQuestion(tx, userId, a.questionId, at);
        }
        applied++;
      }

      for (const unitId of units) await recomputeUnitState(userId, unitId, tx, cfg, DEFAULT_COMPLETION_CONFIG, now);
      return { applied, skipped, unitsUpdated: [...units] };
    },
    { timeout: 30_000 },
  );
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Rebuilds the evidence-based LearningState for one unit. */
export async function recomputeUnitState(
  userId: string,
  unitId: string,
  db: Db = prisma,
  mcfg: MasteryConfig = DEFAULT_MASTERY_CONFIG,
  ccfg: CompletionConfig = DEFAULT_COMPLETION_CONFIG,
  now: Date = new Date(),
  opts: { phase?: 1 | 2 | 3 | 4 } = {},
): Promise<CompletionResult | null> {
  const conceptIds = await lookup.getUnitConceptIds(unitId, db);
  if (!conceptIds.length) return null;

  const stats = await repo.loadConceptStats(db, userId, conceptIds);
  const ls = await repo.getLearningState(db, userId, unitId);
  const openMistakes = await countOpenMistakes(db, userId, unitId);

  let masterySum = 0;
  let completionSum = 0;
  let attempts = 0;
  let correct = 0;
  let pyqA = 0;
  let pyqC = 0;
  const recents: number[] = [];
  const retentions: number[] = [];
  for (const id of conceptIds) {
    const s = stats.get(id);
    if (!s) continue;
    masterySum += s.mastery ?? 0;
    completionSum += s.completion;
    attempts += s.attempts;
    correct += s.correct;
    pyqA += s.pyqAttempts;
    pyqC += s.pyqCorrect;
    if (s.recentAccuracy !== null) recents.push(s.recentAccuracy);
    const r = computeRetention(s.mastery, s.lastSeen, now, mcfg);
    if (r !== null) retentions.push(r);
  }

  // Prerequisite gaps: prerequisite concepts with evidence and low mastery.
  const pairs = await lookup.getPrerequisitePairs(conceptIds, db);
  const prereqIds = [...new Set(pairs.map((p) => p.prerequisiteId))];
  const missing = prereqIds.filter((id) => !stats.has(id));
  const prereqStats = new Map([...stats, ...(await repo.loadConceptStats(db, userId, missing))]);
  const prerequisiteGaps = prereqIds.filter((id) => {
    const m = prereqStats.get(id)?.mastery;
    return m != null && m < ccfg.prerequisiteWeakBelow;
  }).length;

  // Graded evidence at full weight, self-reported evidence at selfReportWeight.
  const w = mcfg.selfReportWeight;
  const practiceEvidence = attempts - pyqA + w * (ls?.reportedAttempts ?? 0);
  const pyqEvidence = pyqA + w * (ls?.reportedPyqAttempts ?? 0);
  const practiceAccuracy =
    practiceEvidence > 0 ? (correct - pyqC + w * (ls?.reportedCorrect ?? 0)) / practiceEvidence : null;
  const pyqAccuracy = pyqEvidence > 0 ? (pyqC + w * (ls?.reportedPyqCorrect ?? 0)) / pyqEvidence : null;

  const evidence: UnitEvidence = {
    conceptCount: conceptIds.length,
    coverage: completionSum / conceptIds.length,
    mastery: masterySum / conceptIds.length,
    evidence: practiceEvidence + pyqEvidence,
    practiceAccuracy,
    practiceEvidence,
    pyqAccuracy,
    pyqEvidence,
    recentAccuracy: mean(recents),
    retention: mean(retentions),
    openMistakes,
    prerequisiteGaps,
    selfReportedContinue: ls?.userWantsToContinue ?? false,
  };

  const result = evaluateUnitCompletion(evidence, ccfg, opts);
  await repo.saveLearningState(db, userId, unitId, {
    coverage: evidence.coverage,
    mastery: evidence.mastery,
    practiceAccuracy,
    pyqAccuracy,
    evidence: evidence.evidence,
    openMistakes,
    result,
  });
  return result;
}
