/**
 * Official-archive adapter — the question papers and answer keys the
 * organising institute publishes itself (architecture §101 Resource
 * Discovery, §48 OFFICIAL tier).
 *
 * This is the highest-trust source in the registry, and the only one where
 * the paper and its answer key are separate machine-generated PDFs that can
 * be joined by question number. That join is what makes the source valuable:
 * `correctAnswer` comes from the institute's own key, not from a model or a
 * community site.
 *
 * Verified against the live GATE 2026 archive (IIT Guwahati):
 *   index : https://gate2026.iitg.ac.in/QPs-answer-keys.html
 *   papers: doc/download/2026/QPs/<PAPER>.pdf
 *   keys  : doc/download/2026/Keys/<PAPER>_Keys.pdf
 * Older organising-institute hosts (gate2025.iitk.ac.in, gate2023.iitk.ac.in,
 * …) are retired and no longer resolve; they return to this registry if they
 * come back, which is why archived years are listed per host rather than
 * synthesised from a URL template.
 *
 * Two known degradations, both surfaced rather than hidden:
 *  - The official papers print math as rasterised images, so a share of
 *    statements are incomplete. Those records carry a blocking error and a
 *    reviewer rejects them.
 *  - The answer key occasionally disagrees with the question paper. The
 *    disagreement is recorded as a validation note for a human, never
 *    silently resolved in favour of one side.
 */
import { decodeEntities } from "./html";
import { downloadPdf, fetchText } from "./http";
import { parsePdf, type ParsedPdf } from "../pdf-parser";
import type {
  ExtractedQuestion,
  IngestContext,
  MappingMatchKind,
  ProvenanceRef,
  SourceAdapter,
  SourceUnit,
} from "./types";

/** Archives we know to be live. A year is only listed once its index page has
 * been fetched successfully, so `--list` never promises content that is not
 * there. */
const ARCHIVES: { year: number; origin: string; indexPath: string }[] = [
  { year: 2026, origin: "https://gate2026.iitg.ac.in", indexPath: "/QPs-answer-keys.html" },
];

/**
 * Paper code -> the subject CODE our syllabus seeds.
 *
 * Only the papers whose subject exists in the app's syllabus are mapped.
 * Everything else is left unresolved on purpose: a paper we cannot classify
 * should reach a human, not be guessed into the wrong subject.
 */
const PAPER_SUBJECT: Record<string, string> = {
  CS1: "CS",
  CS2: "CS",
  GA: "GA",
};

/** GA questions are mixed into every paper under their own section; the key
 * labels them, so a GA row is mined as GA even when it sits in the CS paper. */
const GA_SUBJECT = "GA";

interface PaperLink {
  /** e.g. "CS1". */
  code: string;
  paperUrl: string;
  keyUrl: string | null;
  /** Human label from the page, e.g. "Computer Science & Information
   * Technology (CS-1) (Forenoon)". */
  label: string;
}

/** Collects `{ paperUrl, keyUrl, label }` from the archive index.
 *
 * Parsed with the same regex helpers the other adapters use rather than an
 * HTML parser: the page is server-rendered and stable, and adding a DOM
 * dependency for one page is not worth the supply-chain surface. */
export function parseArchiveIndex(html: string, origin: string): PaperLink[] {
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  const links: PaperLink[] = [];

  for (const row of html.match(rowRe) ?? []) {
    const paperMatch = /href="([^"]*\/QPs\/([A-Za-z0-9_-]+)\.pdf)"/i.exec(row);
    if (!paperMatch) continue;
    const paperHref = paperMatch[1]!;
    const code = paperMatch[2]!;

    const keyMatch = /href="([^"]*\/Keys\/[A-Za-z0-9_-]+_Keys\.pdf)"/i.exec(row);
    const labelMatch = /<a[^>]*>([\s\S]*?)<\/a>/i.exec(row);
    const label = decodeEntities(
      (labelMatch?.[1] ?? code).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    );

    links.push({
      code: code.toUpperCase(),
      paperUrl: new URL(paperHref, origin).toString(),
      keyUrl: keyMatch ? new URL(keyMatch[1]!, origin).toString() : null,
      label,
    });
  }
  return links;
}

/** One parsed question from a paper, before the key is applied. */
interface ParsedQuestion {
  number: number;
  section: "GA" | "PAPER";
  statement: string;
  options: { id: string; text: string }[];
  /** Option labels carry the printed id; kept so an answer letter can be
   * matched to the right option even when the PDF laid them out
   * out of order. */
  optionLabels: string[];
  page: number;
  hasImageContent: boolean;
  /** Marks for this question, taken from the section banner that governs it
   * ("Q.1 – Q.5 Carry ONE mark Each"). */
  marks: number;
}

/** A question starts on a line like `Q.14   ...`, or on a bare `Q.31` when
 * the whole question is a rasterised image and no text followed the number.
 * The banner form `Q.1 – Q.5 Carry ONE mark Each` also begins with "Q." but is
 * consumed by the marks-banner check earlier in the loop, so anything reaching
 * this rule is a real question. */
const QUESTION_START_RE = /^\s*Q\.(\d{1,3})(?:\s+(.*))?$/;
/** `Q.1 – Q.5 Carry ONE mark Each` / `... TWO marks Each`. */
const MARKS_BANNER_RE = /^\s*Q\.\d+\s*[–—-]\s*Q\.\d+\b[^]*?Carry\s+(ONE|TWO)\s+marks?\b/i;
const OPTION_RE = /^\s*\(([A-D])\)\s*(.*)$/;
const SECTION_RE = /^\s*General Aptitude\s*\(GA\)\s*$/i;
/** Footer/header furniture that sits inside the page body once PDF extraction
 * flattens a two-column footer into one line. Matched anywhere in the line so
 * a footer joined to other furniture is still discarded. */
const FOOTER_RE = /Organizing Institute:/i;
const HEADER_RE = /Page \d+ of \d+/i;

/**
 * Splits a paper's text into questions.
 *
 * Statements span several lines and PDF text extraction reorders justify-only
 * segments, so a statement is "everything between this `Q.n` and the next
 * `Q.m`", with section banners switching GA/paper attribution. Options are
 * pulled out of that run and removed from the statement.
 */
export function parsePaperText(parsed: ParsedPdf): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  let section: "GA" | "PAPER" = "PAPER";
  let marks = 1;
  let current: ParsedQuestion | null = null;
  const statementLines: string[] = [];

  const flush = () => {
    if (!current) return;
    const joined = statementLines.join(" ").replace(/\s+/g, " ").trim();
    current.statement = joined;
    // A question whose text is entirely rasterised extracts as an empty
    // statement. It is still emitted: the record carries a blocking error so
    // the reviewer sees the question number and can transcribe it, whereas
    // dropping it here would hide that a question exists at all.
    if (current.statement.length > 0 || current.hasImageContent) out.push(current);
    statementLines.length = 0;
  };

  for (const page of parsed.pages) {
    for (const line of page.lines) {
      const text = line.text.trim();
      if (!text) continue;
      if (FOOTER_RE.test(text) || HEADER_RE.test(text)) continue;

      const banner = MARKS_BANNER_RE.exec(text);
      if (banner) {
        marks = banner[1]!.toUpperCase() === "TWO" ? 2 : 1;
        continue;
      }
      // Any other "Q.a – Q.b" line is a range header, not a question.
      if (/^\s*Q\.\d+\s*[–—-]\s*Q\.\d+\b/.test(text)) continue;

      if (SECTION_RE.test(text)) {
        section = "GA";
        continue;
      }
      // The paper's own section banner (e.g. a "CS-1" heading) switches back.
      if (/^\s*Computer Science/i.test(text)) {
        section = /General Aptitude/i.test(text) ? "GA" : "PAPER";
        continue;
      }

      const qStart = QUESTION_START_RE.exec(text);
      if (qStart) {
        flush();
        current = {
          number: Number(qStart[1]),
          section,
          statement: "",
          options: [],
          optionLabels: [],
          page: page.pageNumber,
          hasImageContent: line.hasImage === true,
          marks,
        };
        statementLines.push((qStart[2] ?? "").trim());
        continue;
      }
      if (!current) continue;

      const opt = OPTION_RE.exec(text);
      if (opt) {
        current.options.push({ id: opt[1]!, text: opt[2]!.trim() });
        current.optionLabels.push(opt[1]!);
        continue;
      }
      if (line.hasImage) current.hasImageContent = true;
      statementLines.push(text);
    }
  }
  flush();
  return out;
}

/**
 * Applies the key to one question, respecting the paper's declared type.
 *
 * Returns the answer in the shape the record needs plus any source-level
 * problem worth showing a reviewer.
 */
export function matchKeyToQuestion(
  q: ParsedQuestion,
  keyType: "MCQ" | "MSQ" | "NAT",
  key: string | undefined
): Pick<
  ExtractedQuestion,
  "correctAnswer" | "natTolerance" | "type" | "marks"
> & { errors: string[] } {
  const errors: string[] = [];
  const marks = q.marks;

  if (!key) {
    // Not reported here: the assembler already raises "missing answer", and
    // duplicating it would double every such record's error count.
    return { type: keyType, marks, errors };
  }

  if (keyType === "NAT") {
    const range = /^\s*(-?[\d.]+)\s+to\s+(-?[\d.]+)\s*$/i.exec(key);
    if (range) {
      const min = Number(range[1]);
      const max = Number(range[2]);
      return {
        type: "NAT",
        natTolerance: { min, max },
        correctAnswer: min === max ? String(min) : `${min} to ${max}`,
        marks,
        errors,
      };
    }
    // A bare number is still a valid NAT key.
    if (/^-?[\d.]+$/.test(key)) {
      return { type: "NAT", correctAnswer: key, marks, errors };
    }
    errors.push(`Answer key "${key}" is not a numeric range for an NAT question.`);
    return { type: "NAT", marks, errors };
  }

  const letters = key
    .split(/[;,]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const known = new Set(q.optionLabels.map((l) => l.toUpperCase()));
  const unknown = letters.filter((l) => !known.has(l));
  if (unknown.length > 0) {
    errors.push(
      `Answer key names option(s) ${unknown.join(", ")} that the paper does not print ` +
        `(printed: ${q.optionLabels.join(", ") || "none"}).`
    );
  }

  if (keyType === "MSQ") {
    // A single correct option is valid for an MSQ ("select all that apply"
    // may have exactly one), so only an empty key is an error.
    if (letters.length === 0) {
      errors.push(`MSQ answer key "${key}" names no option.`);
    }
    return { type: "MSQ", correctAnswer: letters, marks, errors };
  }

  if (letters.length !== 1) {
    errors.push(`MCQ answer key "${key}" does not name exactly one option.`);
  }
  return { type: "MCQ", correctAnswer: letters[0], marks, errors };
}

/** Parses the key PDF's per-question rows into `{ number, type, key }`. */
export function parseAnswerKey(parsed: ParsedPdf): Map<number, { type: "MCQ" | "MSQ" | "NAT"; key: string }> {
  const rows = new Map<number, { type: "MCQ" | "MSQ" | "NAT"; key: string }>();
  const text = parsed.pages.map((p) => p.lines.map((l) => l.text).join("\n")).join("\n");
  const rowRe =
    /^\s*(\d{1,3})\s+\d+\s+(MCQ|MSQ|NAT)\s+([A-Za-z0-9-]+)\s+(.+?)\s+\d\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(text)) !== null) {
    const [num, kind, answer] = [m[1], m[2], m[4]] as [string, string, string];
    rows.set(Number(num), { type: kind as "MCQ" | "MSQ" | "NAT", key: answer.trim() });
  }
  return rows;
}

export class OfficialArchiveAdapter implements SourceAdapter {
  readonly id = "official-archive";
  readonly label = "Official GATE archive (organising institute)";
  readonly reliability = "OFFICIAL" as const;
  /** Government exam papers, published for public use. */
  readonly license = "Official GATE question papers and answer keys, IIT organising institute";
  readonly homepage = "https://gate2026.iitg.ac.in/QPs-answer-keys.html";

  async listUnits(ctx: IngestContext): Promise<SourceUnit[]> {
    const units: SourceUnit[] = [];
    for (const archive of ARCHIVES) {
      const url = archive.origin + archive.indexPath;
      let html: string;
      try {
        html = await fetchText(url, { throttleMs: ctx.throttleMs });
      } catch (err) {
        // A dead archive is reported, not fatal: one retired host must not
        // stop the run for the years that are still up.
        ctx.log(`official-archive: ${archive.year} archive unavailable (${(err as Error).message})`);
        continue;
      }
      for (const link of parseArchiveIndex(html, archive.origin)) {
        units.push({
          id: `${archive.year}-${link.code}`,
          label: `${archive.year} ${link.label}`,
          group: `gate-${archive.year}`,
          params: {
            paperUrl: link.paperUrl,
            keyUrl: link.keyUrl,
            year: archive.year,
            paperCode: link.code,
            subjectHint: PAPER_SUBJECT[link.code] ?? null,
          },
        });
      }
    }
    return units;
  }

  async *ingestUnit(
    unit: SourceUnit,
    ctx: IngestContext
  ): AsyncIterable<ExtractedQuestion[]> {
    const params = (unit.params ?? {}) as {
      paperUrl?: string;
      keyUrl?: string | null;
      year?: number;
      paperCode?: string;
      subjectHint?: string | null;
    };
    if (!params.paperUrl) throw new Error(`Unit ${unit.id} is missing paperUrl`);

    const provenance: ProvenanceRef[] = [];
    const paper = await downloadPdf(params.paperUrl, { throttleMs: ctx.throttleMs });
    provenance.push({
      url: params.paperUrl,
      kind: "pdf",
      artifactHash: paper.artifactHash,
      fetchedAt: new Date().toISOString(),
    });

    // The key is optional: a paper without one is still worth staging, with
    // every answer flagged for a human rather than invented.
    const keyByNumber = new Map<number, { type: "MCQ" | "MSQ" | "NAT"; key: string }>();
    if (params.keyUrl) {
      try {
        const key = await downloadPdf(params.keyUrl, { throttleMs: ctx.throttleMs });
        provenance.push({
          url: params.keyUrl,
          kind: "answer-key",
          artifactHash: key.artifactHash,
          fetchedAt: new Date().toISOString(),
        });
        for (const [num, row] of parseAnswerKey(await parsePdf(key.filePath))) {
          keyByNumber.set(num, row);
        }
      } catch (err) {
        ctx.log(`official-archive: answer key unavailable for ${unit.label} (${(err as Error).message})`);
      }
    }

    const parsedPaper = await parsePdf(paper.filePath);
    const questions = parsePaperText(parsedPaper);
    ctx.log(`official-archive: ${unit.label} -> ${questions.length} question(s), ${keyByNumber.size} key row(s)`);

    const batch: ExtractedQuestion[] = [];
    for (const q of questions) {
      const keyRow = keyByNumber.get(q.number);
      const applied = matchKeyToQuestion(q, keyRow?.type ?? "MCQ", keyRow?.key);

      const errors: string[] = [...applied.errors];
      if (q.statement.length === 0) {
        errors.push(
          "The statement is printed entirely as an image, so no text could be extracted; " +
            "this question needs manual transcription."
        );
      }
      if (q.hasImageContent) {
        errors.push(
          "Contains rasterised math/formula; the extracted text is incomplete and must be verified by hand."
        );
      }
      if (!keyRow) {
        errors.push("No matching row in the official answer key for this question number.");
      }
      if (q.options.length < 2 && applied.type !== "NAT") {
        errors.push(`Paper printed ${q.options.length} option(s); expected at least 2.`);
      }

      // GA questions sit inside a subject paper, so the subject hint follows
      // the key's section, not the paper's own code.
      const subjectHint =
        q.section === "GA" ? GA_SUBJECT : (params.subjectHint ?? null);

      const hints: { text: string; kind: MappingMatchKind }[] = [];
      if (q.section === "GA") hints.push({ text: "General Aptitude", kind: "section-title" });
      else if (unit.label.includes("Computer Science")) {
        hints.push({ text: "Computer Science", kind: "section-title" });
      }

      batch.push({
        sourceQuestionId: `${params.year}-${params.paperCode}-Q${q.number}`,
        statement: q.statement,
        options: q.options,
        correctAnswer: applied.correctAnswer,
        natTolerance: applied.natTolerance,
        type: applied.type,
        year: params.year ?? null,
        exam: `GATE ${params.paperCode} ${params.year}`,
        questionRef: String(q.number),
        marks: applied.marks,
        subjectHint,
        mappingHints: hints,
        topicHint: hints[0]?.text ?? null,
        page: q.page,
        artifactUrl: params.paperUrl,
        sourceUrl: params.paperUrl,
        rawText: q.statement,
        provenance,
        errors,
        extractionConfidence: q.hasImageContent ? 0.4 : 0.9,
        extractionSource: "deterministic",
      });
    }
    if (batch.length > 0) yield batch;
  }
}
