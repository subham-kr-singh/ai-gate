import { questionInputSchema, type QuestionInput } from "@/server/domains/questions/question.schema";
import { computeContentHash } from "@/server/domains/questions/question.service";
import type { ConceptMapping } from "./concept-mapper";
import type { ExtractedQuestion, ProvenanceRef, SourceReliability } from "./sources/types";

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
  /** The source's own stable id for this question. */
  sourceQuestionId: string;
  source: {
    /** Registry id of the adapter that produced this record. */
    adapterId: string;
    /** Trust class of that adapter (§48), carried onto the draft so the
     * reviewer can weigh it without looking up the registry. */
    reliability: SourceReliability;
    exam: string | null;
    year: number | null;
    questionRef: string | null;
    /** Source unit id (GO release tag, ExamSide chapter slug, …). */
    releaseTag: string;
    /** The artifact the text was read from, when there is one. */
    pdfUrl: string | null;
    /** Deep link a reviewer can open. */
    sourceUrl: string | null;
    page: number | null;
    license: string;
    provenance: ProvenanceRef[];
  };
  /** Source metadata tags, kept for the reviewer after normalisation. */
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

/**
 * Parses a NAT answer cell.
 *
 * GO prints exact answers (`7`, `0.99`), equal-value pairs (`65 : 65`), and
 * ranges (`197.9 : 198.1`). Only the range form carries tolerance, so an
 * equal-value pair is treated as exact and the two-sided form as a band.
 *
 * The official IIT keys also print bands as prose ("4.24 to 4.26"), so an
 * explicit `to` between two numbers is read the same way.
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

  // Official keys sometimes spell the band out, e.g. "4.24 to 4.26". The word
  // is required so a bare "4.24 4.26" is still rejected as ambiguous.
  const worded = /^(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)$/i.exec(cleaned);
  if (worded) {
    const a = Number(worded[1]);
    const b = Number(worded[2]);
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
 * Turns one adapter-extracted question into a canonical, Zod-validated
 * record. Source-agnostic: the adapter has already resolved *what* the
 * question says, and this decides whether it is safe to publish.
 *
 * Nothing is guessed silently: whenever the source text is insufficient to
 * build a question that could be graded correctly (rasterised math, a missing
 * answer, an answer letter with no matching option) the reason is recorded in
 * `errors` and `publishable` stays false. The caller stores these as drafts
 * awaiting human review, per the architecture's no-auto-publish rule.
 */
export function assembleRecord(args: {
  extracted: ExtractedQuestion;
  mapping: ConceptMapping | null;
  /** Registry id of the adapter that produced `extracted`. */
  adapterId: string;
  /** Trust class of that adapter (§48). */
  reliability: SourceReliability;
  /** Source unit id, recorded as `releaseTag`. */
  unitId: string;
  license: string;
}): BuiltRecord {
  const { extracted, mapping, adapterId, reliability, unitId, license } = args;
  const errors: string[] = [...extracted.errors];

  const options = extracted.options ?? [];
  const type = extracted.type ?? null;

  if (!mapping) {
    errors.push("Could not resolve a syllabus subject/unit/topic for this block.");
  }
  if (!type) {
    errors.push(
      `Unsupported question shape for the canonical schema (tags: ${(extracted.sourceTags ?? []).join(", ") || "none"}, options: ${options.length}).`
    );
  }
  if (extracted.statement.trim().length < 20) {
    errors.push("Statement is too short to be a complete question.");
  }

  const unreadable = options.filter((o) => o.text.trim().length === 0).map((o) => o.id);
  if (unreadable.length > 0) {
    errors.push(`${unreadable.length} option(s) (${unreadable.join(", ")}) have no extractable text.`);
  }

  let correctAnswer: string | string[] | undefined;
  let natTolerance = extracted.natTolerance;

  const rawAnswer = extracted.correctAnswer;
  const ans = Array.isArray(rawAnswer) ? rawAnswer.join(";") : (rawAnswer ?? "").trim();
  if (!ans) {
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
    const option = options.find((o) => o.id === letter);
    if (!option) errors.push(`Answer "${ans}" does not match any printed option.`);
    else correctAnswer = option.id;
  } else if (type === "MSQ") {
    const letters = Array.isArray(rawAnswer) ? rawAnswer : parseMultiSelectAnswer(ans);
    const valid = letters.filter((l) => options.some((o) => o.id === l));
    if (valid.length === 0) errors.push(`Multi-select answer "${ans}" has no matching options.`);
    else correctAnswer = valid;
  }

  const candidate: Partial<QuestionInput> & Record<string, unknown> = {
    subjectId: mapping?.subjectId,
    unitId: mapping?.unitId,
    topicId: mapping?.topicId,
    conceptIds: mapping?.conceptIds ?? [],
    type: type ?? undefined,
    marks: extracted.marks ?? 1,
    negativeMarks: extracted.negativeMarks ?? 0,
    statement: extracted.statement.trim(),
    options:
      type === "MCQ" || type === "MSQ"
        ? options.map((o) => ({ id: o.id, text: o.text.trim() }))
        : undefined,
    correctAnswer,
    natTolerance,
    year: extracted.year ?? undefined,
    source: extracted.exam ?? undefined,
    sourceUrl: extracted.sourceUrl ?? undefined,
    license,
    difficulty: extracted.difficulty ?? 3,
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
    statement: extracted.statement,
    type: (type ?? "MCQ") as QuestionInput["type"],
    correctAnswer: correctAnswer ?? "",
  });

  return {
    sourceQuestionId: extracted.sourceQuestionId,
    source: {
      adapterId,
      reliability,
      exam: extracted.exam ?? null,
      year: extracted.year ?? null,
      questionRef: extracted.questionRef ?? null,
      releaseTag: unitId,
      pdfUrl: extracted.artifactUrl ?? null,
      sourceUrl: extracted.sourceUrl ?? null,
      page: extracted.page ?? null,
      license,
      provenance: extracted.provenance,
    },
    sourceTags: extracted.sourceTags ?? [],
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
    rawBlockText: extracted.rawText,
    extracted: parsed.success ? parsed.data : candidate,
    errors,
    publishable: errors.length === 0 && parsed.success,
  };
}
