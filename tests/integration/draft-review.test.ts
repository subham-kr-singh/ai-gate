/**
 * The review queue against a real database.
 *
 *   RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/draft-review.test.ts
 *
 * The unit tests cover the payload gate; these cover the state machine around
 * it — that a note blocks approval, that promotion writes an APPROVED question,
 * and that a repeated decision is a no-op rather than an error.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "1";

describe.skipIf(!shouldRun)("draft review", () => {
  let db: typeof import("@/server/db/client").db;
  let decide: typeof import("@/server/domains/ingestion/review.service").decide;
  let getDraft: typeof import("@/server/domains/ingestion/review.service").getDraft;
  let listDrafts: typeof import("@/server/domains/ingestion/review.service").listDrafts;

  const tag = `review-test-${Date.now()}`;
  let subjectId: string;
  let unitId: string;
  let topicId: string;

  const basePayload = () => ({
    subjectId,
    unitId,
    topicId,
    type: "MCQ" as const,
    marks: 1,
    statement: `Which sort is stable? (${tag})`,
    options: [
      { id: "A", text: "Quick sort" },
      { id: "B", text: "Merge sort" },
    ],
    correctAnswer: "B",
  });

  async function makeDraft(overrides: {
    extracted?: unknown;
    validationErrors?: string[];
    contentHash?: string;
  } = {}) {
    return db.ingestedQuestionDraft.create({
      data: {
        sourceAdapterId: tag,
        sourceReleaseTag: tag,
        rawBlockText: "raw text for the review test",
        extracted: (overrides.extracted ?? basePayload()) as object,
        validationErrors: overrides.validationErrors ?? [],
        contentHash: overrides.contentHash ?? `${tag}-${Math.random()}`,
      },
    });
  }

  beforeAll(async () => {
    ({ db } = await import("@/server/db/client"));
    ({ decide, getDraft, listDrafts } = await import("@/server/domains/ingestion/review.service"));

    const version = await db.syllabusVersion.findFirst({ where: { isActive: true } });
    if (!version) throw new Error("No active syllabus version — seed the database first.");

    const subject = await db.subject.findFirstOrThrow({ where: { syllabusVersionId: version.id } });
    subjectId = subject.id;
    const unit = await db.unit.findFirstOrThrow({ where: { subjectId } });
    unitId = unit.id;
    const topic = await db.topic.findFirstOrThrow({ where: { unitId } });
    topicId = topic.id;
  });

  afterAll(async () => {
    // Remove only what this file created, and the question promotion produced.
    const drafts = await db.ingestedQuestionDraft.findMany({
      where: { sourceAdapterId: tag },
      select: { promotedQuestionId: true },
    });
    const questionIds = drafts.map((d) => d.promotedQuestionId).filter((id): id is string => Boolean(id));
    await db.ingestedQuestionDraft.deleteMany({ where: { sourceAdapterId: tag } });
    if (questionIds.length) await db.question.deleteMany({ where: { id: { in: questionIds } } });
  });

  it("refuses to approve a draft carrying a validation note", async () => {
    const draft = await makeDraft({ validationErrors: ["Contains rasterised math/formula; verify by hand."] });
    const result = await decide(draft.id, { decision: "approve" });
    expect(result.outcome).toBe("blocked");

    const after = await getDraft(draft.id);
    expect(after?.status).toBe("DRAFT");
    expect(after?.promotedQuestionId).toBeNull();
    expect(after?.canApprove).toBe(false);
  });

  it("refuses to approve a draft whose payload fails the schema, with no notes", async () => {
    const draft = await makeDraft({ extracted: { statement: "no syllabus ids", type: "MCQ" } });
    const result = await decide(draft.id, { decision: "approve" });
    expect(result.outcome).toBe("blocked");
    if (result.outcome === "blocked") {
      expect(result.issues?.map((i) => i.path)).toContain("subjectId");
    }
    const after = await getDraft(draft.id);
    expect(after?.payloadValid).toBe(false);
    expect(after?.canApprove).toBe(false);
  });

  it("promotes an approvable draft into an APPROVED question", async () => {
    const draft = await makeDraft();
    const before = await getDraft(draft.id);
    expect(before?.canApprove).toBe(true);

    const result = await decide(draft.id, { decision: "approve" });
    expect(result.outcome).toBe("approved");
    if (result.outcome !== "approved") throw new Error("unreachable");

    const question = await db.question.findUniqueOrThrow({ where: { id: result.questionId } });
    expect(question.status).toBe("APPROVED");
    expect(question.subjectId).toBe(subjectId);

    const after = await getDraft(draft.id);
    expect(after?.status).toBe("APPROVED");
    expect(after?.promotedQuestionId).toBe(result.questionId);
  });

  it("refuses to reject or flag a draft whose question is already published", async () => {
    const draft = await makeDraft();
    const approved = await decide(draft.id, { decision: "approve" });
    if (approved.outcome !== "approved") throw new Error("setup failed");

    // Rejecting a published draft would leave the draft saying REJECTED while
    // its question stayed live in the bank — the two records would disagree.
    expect((await decide(draft.id, { decision: "reject" })).outcome).toBe("noop");
    expect((await decide(draft.id, { decision: "flag" })).outcome).toBe("noop");

    const after = await getDraft(draft.id);
    expect(after?.status).toBe("APPROVED");
    expect(after?.promotedQuestionId).toBe(approved.questionId);

    const question = await db.question.findUniqueOrThrow({ where: { id: approved.questionId } });
    expect(question.status).toBe("APPROVED");
  });

  it("treats a repeated approval as a no-op", async () => {
    const draft = await makeDraft();
    const first = await decide(draft.id, { decision: "approve" });
    expect(first.outcome).toBe("approved");

    const second = await decide(draft.id, { decision: "approve" });
    expect(second.outcome).toBe("noop");

    // The promoted question must not be duplicated by the retry.
    const questions = await db.question.count({ where: { statement: basePayload().statement } });
    expect(questions).toBe(1);
  });

  it("flags and rejects, and repeats are no-ops", async () => {
    const draft = await makeDraft();

    expect((await decide(draft.id, { decision: "flag" })).outcome).toBe("flagged");
    expect((await decide(draft.id, { decision: "flag" })).outcome).toBe("noop");

    expect((await decide(draft.id, { decision: "reject" })).outcome).toBe("rejected");
    expect((await decide(draft.id, { decision: "reject" })).outcome).toBe("noop");

    const after = await getDraft(draft.id);
    expect(after?.status).toBe("REJECTED");
    expect(after?.reviewedAt).not.toBeNull();
  });

  it("throws for a draft that does not exist", async () => {
    await expect(decide("does-not-exist", { decision: "approve" })).rejects.toThrow(/not found/i);
  });

  it("filters the queue by status and readiness", async () => {
    await makeDraft({ validationErrors: ["blocked note"] });
    await makeDraft();

    const blocked = await listDrafts({ status: "DRAFT", readyOnly: false, limit: 200 });
    expect(blocked.drafts.some((d) => d.sourceAdapterId === tag)).toBe(true);

    const ready = await listDrafts({ readyOnly: true, limit: 200 });
    const mine = ready.drafts.filter((d) => d.sourceAdapterId === tag);
    expect(mine.every((d) => d.validationErrorCount === 0)).toBe(true);
  });

  it("ignores an unknown status filter instead of throwing", async () => {
    // A filter value from the query string is not trusted as an enum.
    const result = await listDrafts({ status: "'; DROP TABLE", limit: 5 });
    expect(result.summary.total).toBeGreaterThan(0);
  });
});
