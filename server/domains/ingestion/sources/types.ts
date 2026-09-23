/**
 * Multi-source ingestion contracts (architecture §54 Content Ingestion
 * Pipeline, §101 Resource Discovery).
 *
 * A `SourceAdapter` is responsible for exactly two things: enumerating the
 * units of work a source offers, and turning one unit into statements +
 * answers. Everything downstream — syllabus mapping, Zod validation, hashing,
 * dedup, staging, review — is shared and lives outside the adapter.
 *
 * Adapters must not write to the database. They return records; the runner
 * decides what to do with them. That keeps a new source a pure addition
 * (one file + one registry entry) and means an adapter can be tested against
 * a saved fixture with no DB at all.
 */

/** Architecture §48 — source trust class. Drives §102 ranking and the
 * reviewer's default posture toward a source's output. */
export type SourceReliability =
  | "OFFICIAL"
  | "VERIFIED"
  | "CURATED"
  | "COMMUNITY"
  | "AI_GENERATED";

export const RELIABILITY_RANK: Record<SourceReliability, number> = {
  OFFICIAL: 5,
  VERIFIED: 4,
  CURATED: 3,
  COMMUNITY: 2,
  AI_GENERATED: 1,
};

/** What a free-text mapping hint represents, recorded on the draft so a
 * reviewer can see which step produced the syllabus match. */
export type MappingMatchKind = "section-title" | "chapter-title" | "tag" | "none";

/** Where an extracted record's text actually came from. §53 provenance:
 * a record is only as trustworthy as the chain that produced it. */
export interface ProvenanceRef {
  url: string;
  /** What this URL contributed, e.g. "question", "answer-key", "pdf". */
  kind: "question" | "answer-key" | "pdf" | "index";
  /** sha256 of the raw artifact, when a file was downloaded. */
  artifactHash?: string;
  fetchedAt?: string;
}

/** One unit of ingestible work. For GO this is a release; for ExamSide a
 * chapter; for the official archive a year. */
export interface SourceUnit {
  /** Stable id, unique within the adapter. Used for resume/cursor state. */
  id: string;
  /** Human-readable, shown in CLI output and the review UI. */
  label: string;
  /** Optional grouping, e.g. "GATE CSE" or "gatecse-2026". */
  group?: string;
  /** Extra adapter-specific parameters, passed straight back to ingestUnit. */
  params?: Record<string, unknown>;
}

/**
 * A statement + answer as the adapter found it, before syllabus mapping or
 * canonical validation.
 *
 * `errors` here are *source-level* problems: missing answer, unreadable
 * rasterised math, an option with no text. The runner appends schema-level
 * problems later. Any non-empty `errors` keeps the record out of the
 * publishable set.
 */
export interface ExtractedQuestion {
  /** Stable within the source, e.g. an ExamSide qid or GO's "1.1.2". */
  sourceQuestionId: string;
  statement: string;
  options?: { id: string; text: string }[];
  correctAnswer?: string | string[];
  natTolerance?: { min: number; max: number };
  type?: "MCQ" | "MSQ" | "NAT";
  year?: number | null;
  /** Exam label, e.g. "GATE CSE 2018". */
  exam?: string | null;
  /** Source's own reference within the exam, e.g. "13" or "2.15". */
  questionRef?: string | null;
  marks?: number;
  negativeMarks?: number;
  /** 1..5. Adapters that have a signal (GO prints easy/medium/hard tags)
   * set this; otherwise the assembler defaults it. */
  difficulty?: number;
  /** Subject CODE the adapter is confident about ("DBMS"), used to scope
   * syllabus mapping. Null when the adapter cannot tell. */
  subjectHint?: string | null;
  /**
   * Ordered free-text hints for syllabus matching, most specific first. The
   * adapter declares both the text and what it represents, so the reviewer
   * sees *why* a record landed on a topic rather than a generic "matched".
   *
   * Adapters with a single obvious hint can just set `topicHint` instead.
   */
  mappingHints?: { text: string; kind: MappingMatchKind }[];
  /** Free-text topic/section the adapter saw, matched against the syllabus. */
  topicHint?: string | null;
  /** Page the statement was printed on, when the source is paginated. */
  page?: number | null;
  /** The artifact the text was read out of (a PDF URL), when there is one. */
  artifactUrl?: string | null;
  /** Deep link a reviewer can open to see this question at the source. */
  sourceUrl?: string | null;
  /** Kept so a reviewer can verify the tag -> subject step. */
  sourceTags?: string[];
  /** Verbatim source text, stored on the draft for audit. */
  rawText: string;
  /** Source-level problems; non-empty means "do not publish". */
  errors: string[];
  provenance: ProvenanceRef[];
  /** Adapter's own confidence in the extraction (0..1), not the syllabus
   * match confidence. */
  extractionConfidence: number;
  /**
   * How the text was obtained. `"deterministic"` is the DOM/regex/PDF path;
   * `"llm-assisted"` means `llm-assist.ts` reformatted an ambiguous block.
   * Reviewers scrutinise the latter far more closely, so it is recorded
   * rather than left implicit.
   */
  extractionSource?: "deterministic" | "llm-assisted";
}

export interface IngestContext {
  /** Emit progress for long runs. */
  log(message: string): void;
  /** Cap on units/questions, from the CLI. */
  limit?: number;
  /** Polite delay between network calls, in ms. */
  throttleMs: number;
  /** Set when a run should not touch the network (fixtures/tests). */
  dryRun?: boolean;
}

export interface SourceAdapter {
  /** Registry key, e.g. "gopdfs". */
  readonly id: string;
  readonly label: string;
  readonly reliability: SourceReliability;
  /** License string written onto every promoted question (§53). */
  readonly license: string;
  /** Where the source's content comes from, for the docs/UI. */
  readonly homepage: string;

  /**
   * Enumerates units without downloading question content. Used by
   * `--list` and by the plan the human approves before a run.
   */
  listUnits(ctx: IngestContext): Promise<SourceUnit[]>;

  /**
   * Yields batches rather than one array so a 4000-question volume streams
   * to the DB instead of being held in memory.
   */
  ingestUnit(unit: SourceUnit, ctx: IngestContext): AsyncIterable<ExtractedQuestion[]>;
}
