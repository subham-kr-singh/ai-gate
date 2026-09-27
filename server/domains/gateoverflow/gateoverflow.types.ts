/**
 * Shared shapes for the GATE Overflow import pipeline.
 *
 * A `ParsedQuestion` is deliberately source-agnostic: both the official HTML
 * book and the JSON mirror parse down to this, so the mapping/validation/
 * persistence path is written once. `answer` is already normalised to the
 * app's own convention — option ids for MCQ/MSQ, a numeric string for NAT —
 * so the mapping layer never has to know which source it came from.
 */

export type ParsedAnswerKind = "MCQ" | "MSQ" | "NAT" | "UNKNOWN";

export interface ParsedOption {
  id: string;
  text: string;
}

export interface ParsedQuestion {
  /** Id within the source (GO post id for HTML, book number for JSON). */
  sourceQuestionId: string;
  /** Raw chapter heading from the source; used for syllabus mapping. */
  chapter: string;
  /** Subtopic prefix ("Cache Memory"), when the source carries one. */
  subtopic: string | null;
  /**
   * `qa-tag-link` tags. Only used for the book's two catch-all chapters
   * ("Unknown Category", "Others: Others"), where a subject tag is the only
   * signal about what the question is even about.
   */
  tags: string[];
  /** Exam year parsed from the question's provenance line, when present. */
  year: number | null;
  statement: string;
  /** Empty for NAT. */
  options: ParsedOption[];
  /** Option id(s) for MCQ/MSQ, numeric string for NAT. Null when unusable. */
  answer: string | string[] | null;
  natTolerance?: { min: number; max: number };
  answerKind: ParsedAnswerKind;
  sourceUrl: string;
}

/** Why a parsed question was not written, tallied per run. */
export type SkipReason =
  | "unmapped-chapter"
  | "unmapped-unit"
  | "skipped-chapter"
  | "unsupported-type"
  | "missing-answer"
  | "missing-options"
  | "empty-statement"
  | "statement-too-long"
  | "invalid-answer";

export interface Placement {
  subjectId: string;
  unitId: string;
  topicId: string;
  conceptId: string | null;
}
