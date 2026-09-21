import type { Prisma } from "@prisma/client";
import type { Db } from "../shared/db";
import { MASTERY_ALGORITHM_VERSION } from "./mastery.config";
import type { StatsSnapshot } from "./mastery.math";
import { COMPLETION_VERSION } from "./completion.config";
import type { CompletionResult } from "./completion.service";

type StatsRow = StatsSnapshot; // Prisma rows are a superset of the snapshot

const toSnapshot = (r: StatsRow): StatsSnapshot => ({
  completion: r.completion,
  mastery: r.mastery,
  retention: r.retention,
  confidence: r.confidence,
  recentAccuracy: r.recentAccuracy,
  attempts: r.attempts,
  correct: r.correct,
  mistakes: r.mistakes,
  averageTimeMs: r.averageTimeMs,
  lastSeen: r.lastSeen,
  pyqAttempts: r.pyqAttempts,
  pyqCorrect: r.pyqCorrect,
});

const toData = (s: StatsSnapshot) => ({ ...s, algorithmVersion: MASTERY_ALGORITHM_VERSION });

export async function loadConceptStats(db: Db, userId: string, conceptIds: string[]): Promise<Map<string, StatsSnapshot>> {
  if (!conceptIds.length) return new Map();
  const rows = await db.conceptStats.findMany({ where: { userId, conceptId: { in: conceptIds } } });
  return new Map(rows.map((r) => [r.conceptId, toSnapshot(r)]));
}

export async function saveConceptStats(db: Db, userId: string, conceptId: string, s: StatsSnapshot): Promise<void> {
  const data = toData(s);
  await db.conceptStats.upsert({
    where: { userId_conceptId: { userId, conceptId } },
    create: { userId, conceptId, ...data },
    update: data,
  });
}

export async function loadTopicStats(db: Db, userId: string, topicIds: string[]): Promise<Map<string, StatsSnapshot>> {
  if (!topicIds.length) return new Map();
  const rows = await db.topicStats.findMany({ where: { userId, topicId: { in: topicIds } } });
  return new Map(rows.map((r) => [r.topicId, toSnapshot(r)]));
}

export async function saveTopicStats(db: Db, userId: string, topicId: string, s: StatsSnapshot): Promise<void> {
  const data = toData(s);
  await db.topicStats.upsert({
    where: { userId_topicId: { userId, topicId } },
    create: { userId, topicId, ...data },
    update: data,
  });
}

/** true if this answer had not been applied before (safe to count it). */
export async function markOutcomeApplied(db: Db, userId: string, answerId: string): Promise<boolean> {
  const r = await db.appliedOutcome.createMany({
    data: [{ answerId, userId, algorithmVersion: MASTERY_ALGORITHM_VERSION }],
    skipDuplicates: true,
  });
  return r.count === 1;
}

export const getLearningState = (db: Db, userId: string, unitId: string) =>
  db.learningState.findUnique({ where: { userId_unitId: { userId, unitId } } });

export async function saveLearningState(
  db: Db,
  userId: string,
  unitId: string,
  v: {
    coverage: number;
    mastery: number;
    practiceAccuracy: number | null;
    pyqAccuracy: number | null;
    evidence: number;
    openMistakes: number;
    result: CompletionResult;
  },
): Promise<void> {
  const data = {
    status: v.result.status,
    coverage: v.coverage,
    mastery: v.mastery,
    practiceAccuracy: v.practiceAccuracy,
    pyqAccuracy: v.pyqAccuracy,
    evidence: v.evidence,
    openMistakes: v.openMistakes,
    readiness: v.result.readiness,
    decision: v.result.decision,
    reasons: v.result.reasons as unknown as Prisma.InputJsonValue,
    completionVersion: COMPLETION_VERSION,
    masteryVersion: MASTERY_ALGORITHM_VERSION,
  };
  await db.learningState.upsert({
    where: { userId_unitId: { userId, unitId } },
    create: { userId, unitId, ...data },
    update: data,
  });
}

/** Adds a report's self-reported counts to the unit's cumulative counters. */
export async function bumpReportedCounters(
  db: Db,
  userId: string,
  unitId: string,
  c: { attempted: number; correct: number; pyqAttempted: number; pyqCorrect: number; wantsToContinue: boolean },
): Promise<void> {
  await db.learningState.upsert({
    where: { userId_unitId: { userId, unitId } },
    create: {
      userId,
      unitId,
      reportedAttempts: c.attempted,
      reportedCorrect: c.correct,
      reportedPyqAttempts: c.pyqAttempted,
      reportedPyqCorrect: c.pyqCorrect,
      userWantsToContinue: c.wantsToContinue,
    },
    update: {
      reportedAttempts: { increment: c.attempted },
      reportedCorrect: { increment: c.correct },
      reportedPyqAttempts: { increment: c.pyqAttempted },
      reportedPyqCorrect: { increment: c.pyqCorrect },
      userWantsToContinue: c.wantsToContinue,
    },
  });
}
