import { questionInputSchema, type QuestionInput } from "@/server/domains/questions/question.schema";
import { computeContentHash } from "@/server/domains/questions/question.service";
import type { ConceptMapping } from "./concept-mapper";
import type { QuestionBlock } from "./segmenter";

export type CanonicalQuestionType = "MCQ" | "MSQ" | "NAT";

/** Classification evidence kept for the reviewer (architecture §53
 * provenance, §56 "classification confidence is acceptable"). */
export interface ClassificationEvidence {
  subjectId: string | null;
  subjectCode: string | null;
  unitId: string | null;
  topicId: string | null;
  conceptIds: string[];
  confidence: number;
  matchedOn: string;
  rationale: string;
}

export interface BuiltRecord {
  /** `chapter.section.question` from the source PDF. */
  sourceQuestionId: string;
  source: {
    exam: string | null;
    year: number | null;
    questionRef: string | null;
    releaseTag: string;
    pdfUrl: string;
    page: number;
  };
  /** GO tags, kept for the reviewer even after normalisation. */
  sourceTags: string[];
  classification: ClassificationEvidence | null;
  contentHash: string;
  rawBlockText: string;
  extracted: unknown;
  /** Non-empty means the record must not be published, only reviewed. */
  errors: string[];
  /** True when every check passed and the record is safe to publish. */
  publishable: boolean;
}

function parseMarks(tags: string[]): number {
  if (tags.includes("two-marks")) return 2;
  return 1;
}

function parseDifficulty(tags: string[]): number {
  if (tags.includes("easy")) return 2;
  if (tags.includes("hard")) return 4;
  if (tags.includes("medium")) return 4;
  return 3;
}

function inferType(block: QuestionBlock): CanonicalQuestionType | null {
  if (block.tags.includes("numerical-answers")) return "NAT";
  if (block.tags.includes("multiple-selects")) return "MSQ";
  if (block.options.length >= 2) return "MCQ";
  return null;
}

/**
 * Parses a NAT answer cell.
 *
 * GO prints exact answers (`7`, `0.99`), equal-value pairs (`65 : 65`), and
 * ranges (`197.9 : 198.1`). Only the range form carries tolerance, so an
 * equal-value pair is treated as exact and the two-sided form as a band.
 */
export function parseNatAnswer(raw: string): { value: string; min?: number; max?: number } | null {
  const cleaned = raw.replace(/[\u2013\u2014]/g, "-").trim();
  if (!cleaned || cleaned.toUpperCase() === "N/A") return null;

  const pair = /^(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)$/.exec(cleaned);
  if (pair) {
    const a = Number(pair[1]);
    const b = Number(pair[2]);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    if (a === b) return { value: String(a) };
    return { value: String((a + b) / 2), min: Math.min(a, b), max: Math.max(a, b) };
  }

  // GO sometimes prints a range with a leading value and bracket, e.g. "5 [4,6]".
  const bracketed = /^(-?\d+(?:\.\d+)?)\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]$/.exec(cleaned);
  if (bracketed) {
    const value = Number(bracketed[1]);
    const lo = Number(bracketed[2]);
    const hi = Number(bracketed[3]);
    if ([value, lo, hi].some(Number.isNaN)) return null;
    return { value: String(value), min: Math.min(lo, hi), max: Math.max(lo, hi) };
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  return { value: cleaned };
}

/** Splits a multi-select answer cell ("A;C", "A, C", "A B"). */
export function parseMultiSelectAnswer(raw: string): string[] {
  return raw
    .split(/[;,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-E]$/.test(s));
}

/**
 * Converts one segmented block into a canonical, Zod-validated record.
 *
 * Nothing is guessed silently: whenever the source text is insufficient to
 * build a question that could be graded correctly (rasterised math, a missing
 * answer, an answer letter with no matching option) the reason is recorded in
 * `errors` and `publishable` stays false. The caller stores these as drafts
 * awaiting human review, per the architecture's no-auto-publish rule.
 */
export function buildRecord(args: {
  block: QuestionBlock;
  answer: string | undefined;
  mapping: ConceptMapping | null;
  releaseTag: string;
  pdfUrl: string;
}): BuiltRecord {
  const { block, answer, mapping, releaseTag, pdfUrl } = args;
  const errors: string[] = [];

  if (block.hasImageContent) {
    errors.push(
      `Contains ${block.imageLineCount} line(s) of rasterised math/formula; the extracted text is incomplete.`
    );
  }
  if (!mapping) {
    errors.push("Could not resolve a syllabus subject/unit/topic for this block.");
  }
  const type = inferType(block);
  if (!type) {
    errors.push(
      `Unsupported question shape for the canonical schema (tags: ${block.tags.join(", ") || "none"}, options: ${block.options.length}).`
    );
  }
  if (block.statement.trim().length < 20) {
    errors.push("Statement is too short to be a complete question.");
  }

  const emptyOptions = block.options.filter((o) => o.text.trim().length === 0);
  if (emptyOptions.length > 0) {
    errors.push(
      `${emptyOptions.length} option(s) (${emptyOptions.map((o) => o.label).join(", ")}) have no extractable text.`
    );
  }

  let options: { id: string; text: string }[] | undefined;
  let correctAnswer: string | string[] | undefined;
  let natTolerance: { min: number; max: number } | undefined;

  if (type === "MCQ" || type === "MSQ") {
    options = block.options.map((o) => ({ id: o.label, text: o.text.trim() }));
  }

  const ans = (answer ?? "").trim();
  if (!ans || ans.toUpperCase() === "N/A") {
    errors.push("No answer key entry for this question (source prints N/A or omits it).");
  } else if (type === "NAT") {
    const nat = parseNatAnswer(ans);
    if (!nat) {
      errors.push(`Numerical answer "${ans}" is not a parseable number or range.`);
    } else {
      correctAnswer = nat.value;
      if (nat.min !== undefined && nat.max !== undefined) natTolerance = { min: nat.min, max: nat.max };
    }
  } else if (type === "MCQ") {
    const letter = ans.replace(/[^A-Ea-e]/g, "").toUpperCase();
    const option = block.options.find((o) => o.label === letter);
    if (!option) errors.push(`Answer "${ans}" does not match any printed option.`);
    else correctAnswer = option.label;
  } else if (type === "MSQ") {
    const letters = parseMultiSelectAnswer(ans);
    const valid = letters.filter((l) => block.options.some((o) => o.label === l));
    if (valid.length === 0) errors.push(`Multi-select answer "${ans}" has no matching options.`);
    else correctAnswer = valid;
  }

  const candidate: Partial<QuestionInput> & Record<string, unknown> = {
    subjectId: mapping?.subjectId,
    unitId: mapping?.unitId,
    topicId: mapping?.topicId,
    conceptIds: mapping?.conceptIds ?? [],
    type: type ?? undefined,
    marks: parseMarks(block.tags),
    negativeMarks: 0,
    statement: block.statement.trim(),
    options,
    correctAnswer,
    natTolerance,
    year: block.year ?? undefined,
    source: block.examLabel ?? undefined,
    sourceUrl: `${pdfUrl}#page=${block.startPage}`,
    license: "go-pdfs",
    difficulty: parseDifficulty(block.tags),
    status: "DRAFT",
  };

  // Zod is the gate. Its failures are review notes, never silent repairs.
  const parsed = questionInputSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`Schema: ${issue.path.join(".") || "(root)"} — ${issue.message}`);
    }
  }

  const contentHash = computeContentHash({
    statement: block.statement,
    type: (type ?? "MCQ") as QuestionInput["type"],
    correctAnswer: correctAnswer ?? "",
  });

  return {
    sourceQuestionId: block.id,
    source: {
      exam: block.examLabel,
      year: block.year,
      questionRef: block.questionRef,
      releaseTag,
      pdfUrl,
      page: block.startPage,
    },
    sourceTags: block.tags,
    classification: mapping
      ? {
          subjectId: mapping.subjectId,
          subjectCode: mapping.subjectCode,
          unitId: mapping.unitId,
          topicId: mapping.topicId,
          conceptIds: mapping.conceptIds,
          confidence: mapping.confidence,
          matchedOn: mapping.matchedOn,
          rationale: mapping.rationale,
        }
      : null,
    contentHash,
    rawBlockText: block.rawBlockText,
    extracted: parsed.success ? parsed.data : candidate,
    errors,
    publishable: errors.length === 0 && parsed.success,
  };
}
