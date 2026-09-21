import type { PrismaClient, DPPSourceType } from "@prisma/client";
import { db as defaultDb } from "@/server/db/client";
import { DPP_CONFIG_V1, type DPPConfig, type DPPSource } from "./dpp.config";
import { composeDPP } from "./dpp.compose";
import type {
  DPPCandidatePool,
  DPPCandidateQuestion,
  GenerateDPPParams,
  GenerateDPPResult,
} from "./dpp.types";

/**
 * Part 4 — DPP Engine service.
 *
 * Assumes the following from Parts 1–3 (see PROJECT_PLAN.md):
 *   - ConceptStats(userId, conceptId, mastery, nextReviewAt, pyqAttempts, pyqCorrect, ...)
 *   - ConceptDependency(conceptId, prerequisiteConceptId)
 *   - Mistake(userId, conceptId, createdAt, ...)
 *   - Question(id, year, difficulty, status, ...) with a QuestionConcept
 *     join table (questionId, conceptId) for the many-to-many relation
 *   - Attempt(userId, questionId, createdAt) — used to exclude questions
 *     already answered by this user
 *
 * Every query is plain PostgreSQL via Prisma — no LLM anywhere in this
 * file, per GATE_AI_ARCHITECTURE_UPDATED_V1.md §4.2 / §25.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toIsoDate(date: Date): string {
  return toUtcMidnight(date).toISOString().slice(0, 10);
}

/** Questions this user has already attempted — every candidate query excludes these. */
async function getAttemptedQuestionIds(db: PrismaClient, userId: string): Promise<Set<string>> {
  const attempts = await db.attempt.findMany({
    where: { userId },
    select: { questionId: true },
    distinct: ["questionId"],
  });
  return new Set(attempts.map((a) => a.questionId));
}

/** Picks the best (lowest-position) not-yet-excluded question for each concept in `conceptIds`, ranked-in order. */
async function questionsForConcepts(
  db: PrismaClient,
  conceptIds: string[],
  excludeQuestionIds: Set<string>,
  limit: number
): Promise<DPPCandidateQuestion[]> {
  if (conceptIds.length === 0) return [];
  const links = await db.questionConcept.findMany({
    where: {
      conceptId: { in: conceptIds },
      question: { status: "APPROVED" },
    },
    select: { questionId: true, conceptId: true },
    take: limit * 4, // over-fetch; some will be excluded/deduped below
  });
  const seen = new Set<string>();
  const results: DPPCandidateQuestion[] = [];
  for (const link of links) {
    if (excludeQuestionIds.has(link.questionId) || seen.has(link.questionId)) continue;
    seen.add(link.questionId);
    results.push({ questionId: link.questionId, conceptId: link.conceptId });
    if (results.length >= limit) break;
  }
  return results;
}

/** WEAK — concepts with mastery below threshold and no revision due yet (revision has its own bucket). */
async function fetchWeakCandidates(
  db: PrismaClient,
  userId: string,
  config: DPPConfig,
  excludeQuestionIds: Set<string>,
  limit: number
): Promise<DPPCandidateQuestion[]> {
  const weakStats = await db.conceptStats.findMany({
    where: {
      userId,
      mastery: { lt: config.weakMasteryThreshold },
      OR: [{ nextReviewAt: null }, { nextReviewAt: { gt: new Date() } }],
    },
    orderBy: { mastery: "asc" }, // weakest concept first
    select: { conceptId: true },
    take: limit * 3,
  });
  return questionsForConcepts(
    db,
    weakStats.map((s) => s.conceptId),
    excludeQuestionIds,
    limit
  );
}

/** PREREQUISITE — prerequisites of a user's weak concepts, so gaps get addressed before the downstream concept. */
async function fetchPrerequisiteCandidates(
  db: PrismaClient,
  userId: string,
  config: DPPConfig,
  excludeQuestionIds: Set<string>,
  limit: number
): Promise<DPPCandidateQuestion[]> {
  const weakConcepts = await db.conceptStats.findMany({
    where: { userId, mastery: { lt: config.weakMasteryThreshold } },
    orderBy: { mastery: "asc" },
    select: { conceptId: true },
    take: 20,
  });
  if (weakConcepts.length === 0) return [];

  const dependencies = await db.conceptDependency.findMany({
    where: { conceptId: { in: weakConcepts.map((c) => c.conceptId) } },
    select: { prerequisiteConceptId: true },
  });
  const prerequisiteIds = [...new Set(dependencies.map((d) => d.prerequisiteConceptId))];
  if (prerequisiteIds.length === 0) return [];

  // Prefer prerequisites the user is *also* weak in — a strong prerequisite
  // doesn't need extra practice just because it's upstream of a weak concept.
  const prereqStats = await db.conceptStats.findMany({
    where: { userId, conceptId: { in: prerequisiteIds }, mastery: { lt: config.weakMasteryThreshold } },
    orderBy: { mastery: "asc" },
    select: { conceptId: true },
  });
  const rankedConceptIds =
    prereqStats.length > 0 ? prereqStats.map((s) => s.conceptId) : prerequisiteIds;

  return questionsForConcepts(db, rankedConceptIds, excludeQuestionIds, limit);
}

/** REVISION — concepts whose ReviewState/ConceptStats says a review is due within the lookahead window. */
async function fetchRevisionCandidates(
  db: PrismaClient,
  userId: string,
  config: DPPConfig,
  excludeQuestionIds: Set<string>,
  limit: number
): Promise<DPPCandidateQuestion[]> {
  const lookahead = new Date(Date.now() + config.revisionLookaheadDays * DAY_MS);
  const dueStats = await db.conceptStats.findMany({
    where: { userId, nextReviewAt: { not: null, lte: lookahead } },
    orderBy: { nextReviewAt: "asc" }, // most overdue first
    select: { conceptId: true },
    take: limit * 3,
  });
  return questionsForConcepts(
    db,
    dueStats.map((s) => s.conceptId),
    excludeQuestionIds,
    limit
  );
}

/** MISTAKE — concepts tied to a mistake logged within the recency window, most recent first. */
async function fetchMistakeCandidates(
  db: PrismaClient,
  userId: string,
  config: DPPConfig,
  excludeQuestionIds: Set<string>,
  limit: number
): Promise<DPPCandidateQuestion[]> {
  const since = new Date(Date.now() - config.recentMistakeDays * DAY_MS);
  const recentMistakes = await db.mistake.findMany({
    where: { userId, createdAt: { gte: since }, conceptId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { conceptId: true },
    take: limit * 3,
  });
  const conceptIds = [...new Set(recentMistakes.map((m) => m.conceptId as string))];
  return questionsForConcepts(db, conceptIds, excludeQuestionIds, limit);
}

/** PYQ — previous-year questions (year is set), independent of concept weakness, to keep exam pattern exposure constant. */
async function fetchPyqCandidates(
  db: PrismaClient,
  excludeQuestionIds: Set<string>,
  limit: number
): Promise<DPPCandidateQuestion[]> {
  const questions = await db.question.findMany({
    where: {
      status: "APPROVED",
      year: { not: null },
      id: { notIn: [...excludeQuestionIds] },
    },
    orderBy: { year: "desc" },
    select: { id: true },
    take: limit,
  });
  return questions.map((q) => ({ questionId: q.id, conceptId: null }));
}

/** MIXED — general, unweighted approved-question pool. Backstop bucket and backfill source. */
async function fetchMixedCandidates(
  db: PrismaClient,
  excludeQuestionIds: Set<string>,
  limit: number
): Promise<DPPCandidateQuestion[]> {
  const questions = await db.question.findMany({
    where: { status: "APPROVED", id: { notIn: [...excludeQuestionIds] } },
    // Deliberately unordered/broad — this bucket exists to fill gaps, not
    // to target anything specific.
    take: limit,
  });
  return questions.map((q) => ({ questionId: q.id, conceptId: null }));
}

/**
 * Fetches every candidate bucket for one user. Each bucket over-fetches
 * relative to its config quota so the composer's backfill pass has real
 * options rather than immediately falling through to MIXED.
 */
export async function fetchCandidatePool(
  db: PrismaClient,
  userId: string,
  config: DPPConfig
): Promise<DPPCandidatePool> {
  const excludeQuestionIds = await getAttemptedQuestionIds(db, userId);
  const overFetch = (quota: number) => Math.max(quota * 2, 6);

  const [weak, prerequisite, revision, mistake, pyq, mixed] = await Promise.all([
    fetchWeakCandidates(db, userId, config, excludeQuestionIds, overFetch(config.proportions.WEAK)),
    fetchPrerequisiteCandidates(
      db,
      userId,
      config,
      excludeQuestionIds,
      overFetch(config.proportions.PREREQUISITE)
    ),
    fetchRevisionCandidates(
      db,
      userId,
      config,
      excludeQuestionIds,
      overFetch(config.proportions.REVISION)
    ),
    fetchMistakeCandidates(
      db,
      userId,
      config,
      excludeQuestionIds,
      overFetch(config.proportions.MISTAKE)
    ),
    fetchPyqCandidates(db, excludeQuestionIds, overFetch(config.proportions.PYQ)),
    fetchMixedCandidates(db, excludeQuestionIds, config.targetCount), // full backfill reserve
  ]);

  return { WEAK: weak, PREREQUISITE: prerequisite, REVISION: revision, MISTAKE: mistake, PYQ: pyq, MIXED: mixed };
}

/**
 * Generates (or returns) today's DPP for a user. Idempotent per
 * (userId, date): a second call on the same day returns the existing DPP
 * unchanged rather than regenerating it, so refreshing the practice page
 * never reshuffles a set the student has already started.
 */
export async function generateTodaysDPP(
  { userId, date }: GenerateDPPParams,
  config: DPPConfig = DPP_CONFIG_V1,
  db: PrismaClient = defaultDb
): Promise<GenerateDPPResult> {
  const day = toUtcMidnight(date);

  const existing = await db.dPP.findUnique({
    where: { userId_date: { userId, date: day } },
    include: { questions: { orderBy: { position: "asc" } } },
  });

  if (existing) {
    return {
      dppId: existing.id,
      date: toIsoDate(day),
      algorithmVersion: existing.algorithmVersion,
      createdNew: false,
      questions: existing.questions.map((q) => ({
        questionId: q.questionId,
        conceptId: q.conceptId,
        source: q.source as DPPSource,
        position: q.position,
        completedAt: q.completedAt ?? null,
        correct: q.correct ?? null,
      })),
    };
  }

  const pool = await fetchCandidatePool(db, userId, config);
  const composed = composeDPP(pool, config);

  const created = await db.dPP.create({
    data: {
      userId,
      date: day,
      algorithmVersion: config.version,
      targetCount: config.targetCount,
      questions: {
        create: composed.questions.map((q) => ({
          questionId: q.questionId,
          conceptId: q.conceptId,
          source: q.source as DPPSourceType,
          position: q.position,
        })),
      },
    },
    include: { questions: { orderBy: { position: "asc" } } },
  });

  return {
    dppId: created.id,
    date: toIsoDate(day),
    algorithmVersion: created.algorithmVersion,
    createdNew: true,
    questions: created.questions.map((q) => ({
      questionId: q.questionId,
      conceptId: q.conceptId,
      source: q.source as DPPSource,
      position: q.position,
      completedAt: null,
      correct: null,
    })),
  };
}
