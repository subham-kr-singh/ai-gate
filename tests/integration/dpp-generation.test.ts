import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeSeed } from "./fakeDb";

// dpp.service.ts imports its default db from "@/server/db/client" — swap it
// for the in-memory fake before the module under test is loaded, so
// generateTodaysDPP runs its real Prisma-shaped queries against fake data
// instead of a live database.
let fakeDb: ReturnType<typeof createFakeDb>;
vi.mock("@/server/db/client", () => ({
  get db() {
    return fakeDb;
  },
}));

const { generateTodaysDPP } = await import("@/server/domains/dpp/dpp.service");
const { DPP_CONFIG_V1 } = await import("@/server/domains/dpp/dpp.config");

const USER = "user-1";
const TODAY = new Date("2026-09-19T00:00:00.000Z");

function buildSeed(overrides: Partial<FakeSeed> = {}): FakeSeed {
  // 6 concepts: two weak, one revision-due, one mistake-linked, one
  // prerequisite of a weak concept, one the student is already strong in.
  const conceptStats: FakeSeed["conceptStats"] = [
    { userId: USER, conceptId: "c-weak-1", mastery: 0.2, nextReviewAt: null },
    { userId: USER, conceptId: "c-weak-2", mastery: 0.35, nextReviewAt: null },
    { userId: USER, conceptId: "c-revision", mastery: 0.8, nextReviewAt: new Date("2026-09-19T06:00:00Z") },
    { userId: USER, conceptId: "c-prereq", mastery: 0.4, nextReviewAt: null },
    { userId: USER, conceptId: "c-strong", mastery: 0.95, nextReviewAt: null },
  ];
  const conceptDependencies: FakeSeed["conceptDependencies"] = [
    { conceptId: "c-weak-1", prerequisiteConceptId: "c-prereq" },
  ];
  const mistakes: FakeSeed["mistakes"] = [
    { userId: USER, concepts: [{ conceptId: "c-weak-2" }], createdAt: new Date("2026-09-15T00:00:00Z") },
  ];

  // Plenty of approved questions per concept, plus PYQs and a general pool.
  const questions: FakeSeed["questions"] = [];
  const questionConcepts: FakeSeed["questionConcepts"] = [];
  function addQuestionsFor(conceptId: string, count: number, opts: { year?: number } = {}) {
    for (let i = 0; i < count; i++) {
      const id = `${conceptId}-q${i + 1}`;
      questions.push({ id, status: "APPROVED", year: opts.year ?? null });
      questionConcepts.push({ questionId: id, conceptId, question: { status: "APPROVED" } });
    }
  }
  addQuestionsFor("c-weak-1", 8);
  addQuestionsFor("c-weak-2", 8);
  addQuestionsFor("c-revision", 8);
  addQuestionsFor("c-prereq", 8);
  addQuestionsFor("c-strong", 8);
  for (let i = 0; i < 10; i++) {
    questions.push({ id: `pyq-${i + 1}`, status: "APPROVED", year: 2020 + (i % 6) });
  }
  for (let i = 0; i < 15; i++) {
    questions.push({ id: `mixed-${i + 1}`, status: "APPROVED", year: null });
  }

  return {
    questions,
    questionConcepts,
    conceptStats,
    conceptDependencies,
    mistakes,
    answers: [],
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb = createFakeDb(buildSeed());
});

describe("generateTodaysDPP — full pipeline", () => {
  it("produces a complete, correctly-sized DPP from realistic seed data", async () => {
    const result = await generateTodaysDPP({ userId: USER, date: TODAY });
    expect(result.createdNew).toBe(true);
    expect(result.questions).toHaveLength(DPP_CONFIG_V1.targetCount);
    expect(new Set(result.questions.map((q) => q.questionId)).size).toBe(DPP_CONFIG_V1.targetCount);
  });

  it("is idempotent per (userId, date): a second call returns the same DPP unchanged", async () => {
    const first = await generateTodaysDPP({ userId: USER, date: TODAY });
    const second = await generateTodaysDPP({ userId: USER, date: TODAY });

    expect(second.createdNew).toBe(false);
    expect(second.dppId).toBe(first.dppId);
    expect(second.questions.map((q) => q.questionId)).toEqual(first.questions.map((q) => q.questionId));
  });

  it("generates a separate DPP for a different calendar day", async () => {
    const tomorrow = new Date("2026-09-20T00:00:00.000Z");
    const day1 = await generateTodaysDPP({ userId: USER, date: TODAY });
    const day2 = await generateTodaysDPP({ userId: USER, date: tomorrow });

    expect(day2.dppId).not.toBe(day1.dppId);
    expect(day2.date).toBe("2026-09-20");
  });

  it("excludes questions the user has already attempted", async () => {
    fakeDb = createFakeDb(
      buildSeed({
        answers: [
          { userId: USER, questionId: "c-weak-1-q1" },
          { userId: USER, questionId: "c-weak-1-q2" },
        ],
      })
    );
    const result = await generateTodaysDPP({ userId: USER, date: TODAY });
    const ids = result.questions.map((q) => q.questionId);
    expect(ids).not.toContain("c-weak-1-q1");
    expect(ids).not.toContain("c-weak-1-q2");
  });

  it("still returns a (shorter) DPP rather than throwing when the question bank is sparse", async () => {
    fakeDb = createFakeDb({
      questions: [{ id: "only-1", status: "APPROVED", year: null }],
      questionConcepts: [],
      conceptStats: [],
      conceptDependencies: [],
      mistakes: [],
      answers: [],
    });
    const result = await generateTodaysDPP({ userId: USER, date: TODAY });
    expect(result.questions.length).toBeLessThan(DPP_CONFIG_V1.targetCount);
    expect(result.questions.length).toBeGreaterThan(0);
  });
});
