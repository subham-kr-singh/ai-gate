/**
 * server/domains/gateoverflow/gateoverflow.service.ts
 *
 * The import pipeline:
 *
 *   fetch → parse → place on the syllabus → validate with Zod → upsert by
 *   content hash → record a SourceIngestion row
 *
 * It is re-runnable. Re-importing an unchanged corpus is a no-op (the raw
 * bytes hash matches the last completed run), and a changed corpus updates
 * existing rows in place via `contentHash`, so running it on a schedule never
 * duplicates questions. A failure never deletes what is already stored.
 *
 * Nothing reaches the `questions` table without passing the same Zod schema
 * every other writer uses (architecture §3 "Golden rule").
 */

import crypto from "node:crypto";
import { questionInputSchema, type QuestionInput } from "@/server/domains/questions/question.schema";
import { computeContentHash } from "@/server/domains/questions/question.service";
import { DEFAULT_SOURCE_ID, MAX_STATEMENT_CHARS, getSource } from "./gateoverflow.config";
import { buildSyllabusIndex, placeQuestion, type SyllabusIndex } from "./gateoverflow.mapper";
import { parseGateOverflowHtml, parseGateOverflowJson } from "./gateoverflow.parse";
import * as repo from "./gateoverflow.repository";
import type { ParsedQuestion, SkipReason } from "./gateoverflow.types";

const FETCH_TIMEOUT_MS = 60_000;

export interface IngestOptions {
  sourceId?: string;
  /** Parse and report without writing anything. */
  dryRun?: boolean;
  /** Force a re-import even when the raw bytes are unchanged. */
  force?: boolean;
  /** Release tag / commit sha to record as provenance. */
  upstreamRef?: string | null;
  /** Override the fetch (used by tests to avoid the network). */
  fetchImpl?: typeof fetch;
}

export interface IngestSummary {
  sourceId: string;
  sourceUrl: string;
  status: "completed" | "failed" | "unchanged";
  contentHash: string;
  upstreamRef: string | null;
  questionCount: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  /** Rows written per canonical unit, so an import can be eyeballed at a glance. */
  byUnit: Record<string, number>;
  /** Why rows were skipped, most common first. */
  skipReasons: Partial<Record<SkipReason, number>>;
  errors: string[];
  dryRun: boolean;
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "GATE-AI-Study-Assistant/1.0 (personal study tool)",
        Accept: "text/html,application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Builds the Zod-validated question input for one parsed row, or the reason
 * it cannot be imported. Returning a reason rather than throwing keeps the
 * per-run report informative: "412 rows had no answer key" is actionable,
 * "1 row failed" is not.
 */
export function buildQuestionInput(
  question: ParsedQuestion,
  placement: { subjectId: string; unitId: string; topicId: string; conceptId: string | null },
  source: { id: string; label: string; license: string | null }
): { input: QuestionInput } | { skip: SkipReason } {
  if (question.answerKind === "UNKNOWN" || question.answer === null) {
    return { skip: "missing-answer" };
  }
  if (question.answerKind === "NAT" && question.options.length > 0) {
    return { skip: "invalid-answer" };
  }
  if (question.answerKind !== "NAT" && question.options.length < 2) {
    return { skip: "missing-options" };
  }

  const statement = question.statement.trim();
  if (statement.length === 0) return { skip: "empty-statement" };
  if (statement.length > MAX_STATEMENT_CHARS) return { skip: "statement-too-long" };

  const raw = {
    subjectId: placement.subjectId,
    unitId: placement.unitId,
    topicId: placement.topicId,
    conceptIds: placement.conceptId ? [placement.conceptId] : [],
    type: question.answerKind,
    marks: 1,
    negativeMarks: 0,
    statement,
    options: question.answerKind === "NAT" ? undefined : question.options,
    correctAnswer: question.answer,
    natTolerance: question.natTolerance,
    source: `GATE Overflow — ${source.label}`,
    sourceUrl: question.sourceUrl.startsWith("http") ? question.sourceUrl : undefined,
    license: source.license ?? undefined,
    year: question.year ?? undefined,
    difficulty: 3,
    status: "APPROVED" as const,
  };

  const parsed = questionInputSchema.safeParse(raw);
  if (!parsed.success) return { skip: "invalid-answer" };
  return { input: parsed.data };
}

async function processQuestions(
  questions: ParsedQuestion[],
  index: SyllabusIndex,
  source: { id: string; label: string; license: string | null },
  options: { dryRun: boolean; byUnit: Record<string, number>; skipReasons: Partial<Record<SkipReason, number>> }
): Promise<{ imported: number; updated: number; failed: number; errors: string[] }> {
  let imported = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  const tallySkip = (reason: SkipReason) => {
    options.skipReasons[reason] = (options.skipReasons[reason] ?? 0) + 1;
  };

  for (const question of questions) {
    const placed = placeQuestion(index, question.chapter, question.subtopic, question.tags);
    if (placed.status !== "placed") {
      tallySkip(placed.status);
      continue;
    }

    const built = buildQuestionInput(question, placed.placement, source);
    if ("skip" in built) {
      tallySkip(built.skip);
      continue;
    }

    const unitKey = placed.placement.unitId;
    try {
      if (options.dryRun) {
        options.byUnit[unitKey] = (options.byUnit[unitKey] ?? 0) + 1;
        imported += 1;
        continue;
      }
      const contentHash = computeContentHash(built.input);
      const result = await repo.upsertQuestion(built.input, contentHash);
      if (result.created) imported += 1;
      else updated += 1;
      options.byUnit[unitKey] = (options.byUnit[unitKey] ?? 0) + 1;
    } catch (err) {
      failed += 1;
      if (errors.length < 20) {
        errors.push(`${question.sourceQuestionId}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
  }

  return { imported, updated, failed, errors };
}

export async function ingestGateOverflow(options: IngestOptions = {}): Promise<IngestSummary> {
  const source = getSource(options.sourceId ?? DEFAULT_SOURCE_ID);
  const fetchImpl = options.fetchImpl ?? fetch;
  const dryRun = options.dryRun ?? false;
  const upstreamRef = options.upstreamRef ?? null;

  const raw = await fetchText(source.url, fetchImpl);
  const contentHash = crypto.createHash("sha256").update(raw).digest("hex");

  const emptySummary = (): IngestSummary => ({
    sourceId: source.id,
    sourceUrl: source.url,
    status: "unchanged",
    contentHash,
    upstreamRef,
    questionCount: 0,
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    byUnit: {},
    skipReasons: {},
    errors: [],
    dryRun,
  });

  if (!dryRun && !options.force) {
    const previous = await repo.findCompletedIngestion(source.id, contentHash);
    if (previous) return emptySummary();
  }

  const parsed =
    source.kind === "html" ? parseGateOverflowHtml(raw) : parseGateOverflowJson(JSON.parse(raw));

  const index = await buildSyllabusIndex();
  const byUnit: Record<string, number> = {};
  const skipReasons: Partial<Record<SkipReason, number>> = {};

  const run = dryRun
    ? null
    : await repo.startIngestion({
        sourceId: source.id,
        sourceUrl: source.url,
        license: source.license,
        upstreamRef,
        contentHash,
      });

  try {
    const result = await processQuestions(parsed, index, source, { dryRun, byUnit, skipReasons });
    const skipped = Object.values(skipReasons).reduce((sum, n) => sum + (n ?? 0), 0);

    const summary: IngestSummary = {
      sourceId: source.id,
      sourceUrl: source.url,
      status: "completed",
      contentHash,
      upstreamRef,
      questionCount: parsed.length,
      importedCount: result.imported,
      updatedCount: result.updated,
      skippedCount: skipped,
      failedCount: result.failed,
      byUnit,
      skipReasons,
      errors: result.errors,
      dryRun,
    };

    if (run) {
      await repo.finishIngestion(run.id, {
        status: "completed",
        questionCount: summary.questionCount,
        importedCount: summary.importedCount,
        updatedCount: summary.updatedCount,
        skippedCount: summary.skippedCount,
        failedCount: summary.failedCount,
        report: { byUnit, skipReasons, errors: result.errors },
      });
    }

    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    if (run) {
      await repo.finishIngestion(run.id, {
        status: "failed",
        questionCount: parsed.length,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: parsed.length,
        error: message,
        report: { byUnit, skipReasons },
      });
    }
    throw err;
  }
}

export async function listIngestionHistory(limit = 20) {
  return repo.listIngestions(limit);
}

export async function questionBankSize(): Promise<number> {
  return repo.countQuestions();
}
