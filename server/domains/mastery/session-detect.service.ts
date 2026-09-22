/**
 * Auto-detected study sessions.
 *
 * "Log study session" used to mean filling a form. But work done inside the
 * app is already recorded — every submitted quiz, mock and DPP answer is an
 * Answer row that feed the mastery engine. This service reconstructs what the
 * student actually studied from that evidence, so the Log screen can *show*
 * the session instead of asking them to retype it.
 *
 * Strictly read-only: applying evidence happens at submit time
 * (test.service / dpp grading). Re-deriving a session here must never write,
 * or the same answers would be counted twice.
 */
import { db as prisma } from "@/server/db/client";
import type { Db } from "../shared/db";

export interface DetectedConcept {
  conceptId: string;
  name: string;
  attempted: number;
  correct: number;
}

export interface DetectedSession {
  /** Stable key for the client — the unit plus the day the work happened. */
  id: string;
  unitId: string;
  unitName: string;
  subjectCode: string | null;
  subjectName: string | null;
  /** Calendar day (UTC) the evidence belongs to. */
  day: string;
  startedAt: string;
  endedAt: string;
  questionsAttempted: number;
  questionsCorrect: number;
  accuracy: number;
  sources: { quiz: number; mock: number; dpp: number };
  /** Concepts where the student got at least one wrong — the weak spots. */
  weakConcepts: DetectedConcept[];
  isPyq: boolean;
}

export interface DetectOptions {
  /** How far back to look. Defaults to 14 days. */
  days?: number;
  /** Injectable clock for tests. */
  now?: Date;
}

const DAY_MS = 86_400_000;

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface RawAnswer {
  answeredAt: Date;
  correct: boolean;
  conceptIds: string[];
  unitId: string | null;
  source: "quiz" | "mock" | "dpp";
  isPyq: boolean;
}

/**
 * Collects every graded answer in the window, tagged with the unit and
 * concepts it maps to. Answers with no concept mapping still count when they
 * carry a unit (a question slotted into a DPP knows its unit).
 */
async function collectAnswers(userId: string, since: Date, db: Db): Promise<RawAnswer[]> {
  const attempts = await db.attempt.findMany({
    where: { userId, submittedAt: { gte: since } },
    select: {
      submittedAt: true,
      test: { select: { type: true } },
      answers: {
        select: { questionId: true, correct: true },
      },
    },
  });

  const dppQuestions = await db.dPPQuestion.findMany({
    where: { dpp: { userId }, completedAt: { gte: since } },
    select: {
      questionId: true,
      correct: true,
      completedAt: true,
      conceptId: true,
      question: { select: { unitId: true, year: true } },
    },
  });

  const questionIds = [
    ...new Set([
      ...attempts.flatMap((a) => a.answers.map((x) => x.questionId)),
      ...dppQuestions.map((q) => q.questionId),
    ]),
  ];
  const questions = await db.question.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      unitId: true,
      year: true,
      concepts: { select: { conceptId: true } },
    },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));

  const out: RawAnswer[] = [];
  for (const attempt of attempts) {
    const source = attempt.test.type === "MOCK" ? "mock" : "quiz";
    for (const ans of attempt.answers) {
      const q = byId.get(ans.questionId);
      out.push({
        answeredAt: attempt.submittedAt,
        correct: ans.correct,
        conceptIds: q?.concepts.map((c) => c.conceptId) ?? [],
        unitId: q?.unitId ?? null,
        source,
        isPyq: Boolean(q?.year),
      });
    }
  }

  for (const dq of dppQuestions) {
    if (dq.correct == null) continue; // untouched slot
    const q = byId.get(dq.questionId);
    out.push({
      answeredAt: dq.completedAt!,
      correct: dq.correct,
      conceptIds: dq.conceptId ? [dq.conceptId] : (q?.concepts.map((c) => c.conceptId) ?? []),
      unitId: q?.unitId ?? null,
      source: "dpp",
      isPyq: Boolean(q?.year),
    });
  }

  return out;
}

export async function detectStudySessions(
  userId: string,
  opts: DetectOptions = {},
  db: Db = prisma,
): Promise<DetectedSession[]> {
  const days = opts.days ?? 14;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - days * DAY_MS);

  const raw = await collectAnswers(userId, since, db);
  if (!raw.length) return [];

  const conceptIds = [...new Set(raw.flatMap((a) => a.conceptIds))];
  const concepts = conceptIds.length
    ? await db.concept.findMany({
        where: { id: { in: conceptIds } },
        select: { id: true, name: true, topic: { select: { unitId: true } } },
      })
    : [];
  const conceptName = new Map(concepts.map((c) => [c.id, c.name]));
  const conceptUnit = new Map(concepts.map((c) => [c.id, c.topic.unitId]));

  // Group by (unit, day). Answers without a unit can't be attributed, so they
  // are dropped rather than lumped into a fake "unknown" unit.
  const groups = new Map<string, RawAnswer[]>();
  for (const a of raw) {
    const unitId = a.unitId ?? a.conceptIds.map((c) => conceptUnit.get(c)).find(Boolean) ?? null;
    if (!unitId) continue;
    const key = `${unitId}|${utcDay(a.answeredAt)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(a);
    else groups.set(key, [a]);
  }
  if (!groups.size) return [];

  const unitIds = [...new Set([...groups.keys()].map((k) => k.split("|")[0]!))];
  const units = await db.unit.findMany({
    where: { id: { in: unitIds } },
    select: { id: true, name: true, subject: { select: { code: true, name: true } } },
  });
  const unitById = new Map(units.map((u) => [u.id, u]));

  const sessions: DetectedSession[] = [];
  for (const [key, answers] of groups) {
    const [unitId, day] = key.split("|") as [string, string];
    const unit = unitById.get(unitId);
    if (!unit) continue;

    const attempted = answers.length;
    const correct = answers.filter((a) => a.correct).length;
    const times = answers.map((a) => a.answeredAt.getTime());

    const perConcept = new Map<string, DetectedConcept>();
    for (const a of answers) {
      for (const cid of a.conceptIds) {
        const entry = perConcept.get(cid) ?? {
          conceptId: cid,
          name: conceptName.get(cid) ?? "Unknown concept",
          attempted: 0,
          correct: 0,
        };
        entry.attempted++;
        if (a.correct) entry.correct++;
        perConcept.set(cid, entry);
      }
    }

    sessions.push({
      id: `${unitId}|${day}`,
      unitId,
      unitName: unit.name,
      subjectCode: unit.subject.code,
      subjectName: unit.subject.name,
      day,
      startedAt: new Date(Math.min(...times)).toISOString(),
      endedAt: new Date(Math.max(...times)).toISOString(),
      questionsAttempted: attempted,
      questionsCorrect: correct,
      accuracy: attempted ? correct / attempted : 0,
      sources: {
        quiz: answers.filter((a) => a.source === "quiz").length,
        mock: answers.filter((a) => a.source === "mock").length,
        dpp: answers.filter((a) => a.source === "dpp").length,
      },
      weakConcepts: [...perConcept.values()]
        .filter((c) => c.correct < c.attempted)
        .sort((a, b) => a.correct / a.attempted - b.correct / b.attempted),
      isPyq: answers.some((a) => a.isPyq),
    });
  }

  return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
