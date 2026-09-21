import crypto from "node:crypto";
import * as repo from "./question.repository";
import { questionFilterSchema, questionInputSchema, type QuestionInput } from "./question.schema";

/** Deterministic content hash used for exact-duplicate detection
 * (architecture §20 "Question Deduplication") and as the import script's
 * upsert key — importing the same source file twice is a no-op, not a
 * duplicate row. */
export function computeContentHash(input: Pick<QuestionInput, "statement" | "type" | "correctAnswer">): string {
  const normalized = JSON.stringify({
    statement: input.statement.trim().toLowerCase().replace(/\s+/g, " "),
    type: input.type,
    correctAnswer: input.correctAnswer,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/** Validates raw input with Zod, then upserts by contentHash. Never called
 * with unvalidated AI or import-script output — Zod is the required gate
 * (architecture §3 "Golden rule"). */
export async function importQuestion(raw: unknown) {
  const parsed = questionInputSchema.parse(raw);
  const contentHash = computeContentHash(parsed);

  return repo.upsertByContentHash({
    contentHash,
    type: parsed.type,
    marks: parsed.marks,
    negativeMarks: parsed.negativeMarks,
    statement: parsed.statement,
    options: parsed.options ?? undefined,
    correctAnswer: parsed.correctAnswer,
    natTolerance: parsed.natTolerance ?? undefined,
    solution: parsed.solution,
    year: parsed.year,
    source: parsed.source,
    sourceUrl: parsed.sourceUrl,
    license: parsed.license,
    difficulty: parsed.difficulty,
    difficultySource: "MANUAL",
    difficultyVersion: "v1",
    status: parsed.status,
    subject: { connect: { id: parsed.subjectId } },
    unit: { connect: { id: parsed.unitId } },
    topic: { connect: { id: parsed.topicId } },
    concepts: parsed.conceptIds.length
      ? {
          create: parsed.conceptIds.map((conceptId) => ({
            concept: { connect: { id: conceptId } },
          })),
        }
      : undefined,
  });
}

export async function searchQuestions(rawFilter: unknown) {
  const filter = questionFilterSchema.parse(rawFilter);
  return repo.search(filter);
}

export async function getQuestionsByIds(ids: string[]) {
  return repo.findByIds(ids);
}
