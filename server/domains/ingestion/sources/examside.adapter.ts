/**
 * ExamSide adapter (questions.examside.com) — GATE CSE past-year questions
 * with verified answer keys.
 *
 * Why this source, and why this shape (architecture §46, §48, §101):
 *
 *  - Its questions are the *real* GATE CSE papers, so they carry exam + year +
 *    marks, which makes them the natural corroboration partner for GO-PDFs
 *    (§102 duplicate content): the same question seen in both is strong
 *    evidence both extractions are right.
 *  - Unlike GO's PDFs, the statements here are live text, not rasterised
 *    images, so the publishable yield is far higher than GO's 14.5%.
 *
 * Access rules this adapter must respect:
 *
 *  - `robots.txt` allows `User-agent: *` on `/` but disallows `GPTBot`. We
 *    crawl as an ordinary identified agent (`GateAI-Ingest/1.0`), never as an
 *    LLM crawler, and every fetch goes through `http.ts` which enforces
 *    robots.txt before the first request.
 *  - Answers are NOT in the HTML: every option carries an identical hidden
 *    `tag-correct` template and `data-state` is always empty. The key is
 *    served by `POST /api/check_answer`, which the site's own JS calls with
 *    `{qid, input, options, timeSpent}` and which returns `corrects: [index]`.
 *    We call it once per question — never repeatedly to "guess" an answer.
 *  - Requests are throttled (default 1.5s/host) and cached on disk, so a
 *    re-run costs the source nothing.
 */
import { hasFormulaGap, innerOf, textOf } from "./html";
import { fetchJson, fetchText } from "./http";
import type { ExtractedQuestion, IngestContext, SourceAdapter, SourceUnit } from "./types";

const ORIGIN = "https://questions.examside.com";
const SITEMAP_INDEX = `${ORIGIN}/sitemap/sitemap.xml`;
const CHAPTERS_SITEMAP = `${ORIGIN}/sitemap/past-years/chapters.xml`;
const CHECK_ANSWER = `${ORIGIN}/api/check_answer`;

/**
 * ExamSide's subject slug -> the app's `Subject.code`.
 *
 * Derived from the sitemap's own slug vocabulary, not invented: any slug not
 * listed here yields a null hint, which leaves the draft unresolved for a
 * human rather than misfiling it. `web-technologies` and `software-engineering`
 * are intentionally absent — GATE CSE stopped examining them and the app's
 * syllabus has no subject for them.
 */
const SUBJECT_SLUG_TO_CODE: Record<string, string> = {
  "discrete-mathematics": "MATH",
  "engineering-mathematics": "MATH",
  "digital-logic": "DL",
  "computer-organization": "COA",
  "programming-languages": "PDS",
  "data-structures": "PDS",
  algorithms: "ALGO",
  "compiler-design": "CD",
  "operating-systems": "OS",
  "database-management-system": "DBMS",
  "computer-networks": "CN",
  "theory-of-computation": "TOC",
  "general-aptitude": "GA",
};

export interface ExamSideChapter {
  /** Full chapter URL. */
  url: string;
  subjectSlug: string;
  chapterSlug: string;
}

/** `.../gate/gate-cse/<subject>/<chapter>` -> structured parts. */
export function parseChapterUrl(url: string): ExamSideChapter | null {
  const m = /\/past-years\/gate\/gate-cse\/([^/]+)\/([^/?#]+)/.exec(url);
  if (!m?.[1] || !m[2]) return null;
  return { url, subjectSlug: m[1], chapterSlug: m[2] };
}

/** Pulls GATE CSE chapter URLs out of the chapters sitemap. */
export function chaptersFromSitemap(xml: string): ExamSideChapter[] {
  const out: ExamSideChapter[] = [];
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1];
    if (!loc || !loc.includes("/gate/gate-cse/")) continue;
    const parsed = parseChapterUrl(loc);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Question page URLs listed on a chapter page, with their preview text. */
export function questionLinksFromChapter(html: string): { url: string; preview: string }[] {
  const out: { url: string; preview: string }[] = [];
  const re = /<a class="cp-q[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const href = m[1];
    const body = m[2];
    if (!href || !body) continue;
    const url = href.startsWith("http") ? href : `${ORIGIN}${href}`;
    const preview = textOf(innerOf(body, /<div class="cp-q-preview[^>]*>/i) ?? body);
    out.push({ url, preview });
  }
  return out;
}

export interface ParsedExamSideQuestion {
  /** Stable id from the URL slug — the dedup key, and what we store as
   * `sourceQuestionId`. */
  sourceId: string;
  /** The site's own answer-key id. Shorter than the URL slug and *not* the
   * same value: `POST /api/check_answer` only accepts this one. It is stable
   * across fetches (verified by re-fetching the same page repeatedly). */
  answerKeyId: string;
  type: "MCQ" | "MSQ" | "NAT";
  statement: string;
  options: { id: string; text: string }[];
  exam: string | null;
  year: number | null;
  marks: number | null;
  negativeMarks: number | null;
  optionCount: number;
  /** Images the question depends on (figures, tables, circuits). These carry
   * no extractable text, so a question that has one is not publishable from
   * the page alone — see `toExtracted`. */
  figures: { url: string; alt: string }[];
}

/** The persistent id at the end of a question URL: a 16-char token, with the
 * `.htm` suffix present on older URLs only. */
export function questionIdFromUrl(url: string): string | null {
  return /-([a-z0-9]{16})(?:\.htm)?$/i.exec(url)?.[1] ?? null;
}

/**
 * Parses a question page.
 *
 * Two details of the page's structure matter here:
 *
 *  1. The page's **own** question is the *first* `.question-component`. The
 *     rest are siblings rendered for "previous/next" navigation. Matching by
 *     the URL's 16-char slug does not work, because the component's `data-qid`
 *     is a different, shorter id — the one the answer-key API wants.
 *  2. The page's `<title>` names the question's exam. Checking it against the
 *     first component is what makes "take the first one" safe: if the site
 *     ever reorders the page, this returns null and the question is reported
 *     as a failure instead of being silently attributed to the wrong paper.
 */
export function parseQuestionPage(html: string, sourceUrl: string): ParsedExamSideQuestion | null {
  const sourceId = questionIdFromUrl(sourceUrl);
  if (!sourceId) return null;

  const at = /<div class="question-component[^"]*"[^>]*data-qid="([^"]+)"[^>]*data-type="([^"]*)"[^>]*>/i.exec(
    html
  );
  if (!at?.[1]) return null;
  const answerKeyId = at[1];

  // Slice from this component to the next one, so nested markup stays scoped.
  // The search starts past this tag's own text; otherwise it matches the tag
  // it is standing on.
  const start = at.index;
  const nextIdx = html.indexOf("question-component", start + at[0].length);
  const block = nextIdx > 0 ? html.slice(start, nextIdx) : html.slice(start);

  const paper = textOf(innerOf(block, /<div class="q-paper"[^>]*>/i) ?? "");
  const titleExam = /<title>([^|<]*)\|/.exec(html)?.[1]?.trim() ?? null;
  if (titleExam && paper && titleExam !== paper) return null;

  const rawType = at[2]?.toLowerCase() ?? "";
  // The site labels numerical questions `data-type="integer"`; MSQ is the only
  // type whose answer is a set rather than a single option.
  const type: ParsedExamSideQuestion["type"] =
    rawType.includes("msq") || rawType.includes("multiple")
      ? "MSQ"
      : rawType.includes("nat") || rawType.includes("numerical") || rawType.includes("integer")
        ? "NAT"
        : "MCQ";

  const statementHtml =
    innerOf(block, /<div class="question q-prose"[^>]*>/i) ??
    innerOf(block, /<div class="q-body"[^>]*>/i) ??
    "";
  const statement = textOf(statementHtml);

  // Each option starts at `<div class="option" data-option="N"`; splitting on
  // that boundary is far less brittle than trying to match the closing tags,
  // which nest to a depth that varies with the option content.
  const options: { id: string; text: string }[] = [];
  const parts = block.split(/<div class="option"[^>]*data-option="(\d+)"[^>]*>/);
  for (let i = 1; i < parts.length; i += 2) {
    const idx = Number(parts[i]);
    const body = parts[i + 1] ?? "";
    if (Number.isNaN(idx)) continue;
    const content = innerOf(body, /<div class="option-content[^"]*"[^>]*>/i) ?? body;
    options.push({ id: String.fromCharCode(65 + idx), text: textOf(content) });
  }

  const yearMatch = /(\d{4})/.exec(paper);

  // Figures and tables are rasterised, so they carry no text. Recording them
  // lets a reviewer see *why* a question is not publishable instead of finding
  // a statement with a hole in it.
  const figures: { url: string; alt: string }[] = [];
  for (const m of block.matchAll(/<img\b[^>]*>/gi)) {
    const src = /src="([^"]+)"/i.exec(m[0])?.[1];
    if (!src) continue;
    const alt = /alt="([^"]*)"/i.exec(m[0])?.[1] ?? "";
    figures.push({ url: src, alt });
  }

  const plusMarks = /marks-plus[^>]*>\s*\+?([\d.]+)/.exec(block);
  const minusMarks = /marks-minus[^>]*>\s*[−-]?([\d.]+)/.exec(block);

  return {
    sourceId,
    answerKeyId,
    type,
    statement,
    options,
    exam: paper || null,
    year: yearMatch ? Number(yearMatch[1]) : null,
    marks: plusMarks ? Number(plusMarks[1]) : null,
    negativeMarks: minusMarks ? Number(minusMarks[1]) : null,
    optionCount: options.length,
    figures,
  };
}

interface CheckAnswerResponse {
  status?: string;
  err_code?: number;
  right?: boolean;
  corrects?: number[];
  /** Present for numerical questions; null for choice questions. */
  answer?: string | number | null;
}

export class ExamSideAdapter implements SourceAdapter {
  readonly id = "examside";
  readonly label = "ExamSide GATE CSE past-year questions";
  readonly reliability = "VERIFIED" as const;
  readonly license = "examside-link-only";
  readonly homepage = "https://questions.examside.com/past-years/gate/gate-cse";

  /** One unit per chapter, grouped by subject. Chapter URLs come from the
   * site's own sitemap rather than being guessed, so we never crawl a path
   * the site doesn't publish. */
  async listUnits(ctx: IngestContext): Promise<SourceUnit[]> {
    const xml = await fetchText(CHAPTERS_SITEMAP, { throttleMs: ctx.throttleMs });
    const chapters = chaptersFromSitemap(xml);
    ctx.log(`      ${chapters.length} GATE CSE chapter(s) in sitemap`);
    return chapters.map((c) => ({
      id: c.chapterSlug,
      label: `${c.subjectSlug}/${c.chapterSlug}`,
      group: SUBJECT_SLUG_TO_CODE[c.subjectSlug] ?? c.subjectSlug,
      params: { url: c.url, subjectSlug: c.subjectSlug },
    }));
  }

  async *ingestUnit(unit: SourceUnit, ctx: IngestContext): AsyncIterable<ExtractedQuestion[]> {
    const url = String(unit.params?.url ?? "");
    const subjectSlug = String(unit.params?.subjectSlug ?? "");
    if (!url) throw new Error(`ExamSide unit "${unit.id}" is missing its url`);

    const chapterHtml = await fetchText(url, { throttleMs: ctx.throttleMs });
    let links = questionLinksFromChapter(chapterHtml);
    ctx.log(`      ${links.length} question link(s)`);
    if (ctx.limit) links = links.slice(0, ctx.limit);

    const batch: ExtractedQuestion[] = [];
    for (const link of links) {
      // The URL's 16-char token is the stable identity (used for dedup). The
      // page's own answer-key id is read from the markup by the parser.
      const sourceId = questionIdFromUrl(link.url);
      if (!sourceId) {
        batch.push(this.failed(link, unit, subjectSlug, "Could not read a question id from the URL."));
        continue;
      }
      try {
        const pageHtml = await fetchText(link.url, { throttleMs: ctx.throttleMs });
        const parsed = parseQuestionPage(pageHtml, link.url);
        if (!parsed) {
          batch.push(
            this.failed(
              link,
              unit,
              subjectSlug,
              "Could not identify this question on its page (structure changed, or the page's " +
                "question does not match its own title)."
            )
          );
          continue;
        }
        batch.push(await this.toExtracted(parsed, link, unit, subjectSlug, ctx));
      } catch (err) {
        batch.push(
          this.failed(link, unit, subjectSlug, `Fetch failed: ${(err as Error).message}`)
        );
      }
      if (batch.length >= 20) yield batch.splice(0, batch.length);
    }
    if (batch.length) yield batch.splice(0, batch.length);
  }

  /** The answer key is the one thing not in the HTML. One POST per question
   * returns it; a non-success response is recorded as a review note rather
   * than retried. */
  private async toExtracted(
    parsed: ParsedExamSideQuestion,
    link: { url: string; preview: string },
    unit: SourceUnit,
    subjectSlug: string,
    ctx: IngestContext
  ): Promise<ExtractedQuestion> {
    const errors: string[] = [];
    if (!parsed.statement) errors.push("Statement could not be extracted from the page.");
    else if (hasFormulaGap(parsed.statement)) {
      errors.push("Statement contains an inline-math gap; the formula did not come through as text.");
    }
    const blank = parsed.options.filter((o) => !o.text);
    if (blank.length) {
      errors.push(`Option(s) ${blank.map((o) => o.id).join(", ")} have no extractable text.`);
    }
    if (parsed.figures.length) {
      errors.push(
        `Statement depends on ${parsed.figures.length} image(s) that carry no text; ` +
          `needs manual transcription before it can be published.`
      );
    }

    let correctAnswer: string | undefined;
    try {
      const res = await fetchJson<CheckAnswerResponse>(
        CHECK_ANSWER,
        { qid: parsed.answerKeyId, input: null, options: [0], timeSpent: 0 },
        ctx.throttleMs
      );
      if (res.status === "success" && res.err_code === 0) {
        // NAT answers come back in `answer` as a bare value ("19"), while
        // choice questions come back as `corrects` indices. Both are the
        // site's own key, returned by one call.
        if (parsed.type === "NAT") {
          if (res.answer !== null && res.answer !== undefined && res.answer !== "") {
            correctAnswer = String(res.answer);
          } else {
            errors.push("No numerical answer returned for this question.");
          }
        } else if (res.corrects?.length) {
          correctAnswer = res.corrects.map((i) => String.fromCharCode(65 + i)).join(";");
        } else {
          errors.push("Answer key response contained no correct option.");
        }
      } else {
        errors.push(`Answer key request did not succeed (status: ${res.status ?? "none"}).`);
      }
    } catch (err) {
      errors.push(`Answer key request failed: ${(err as Error).message}`);
    }

    return {
      sourceQuestionId: parsed.sourceId,
      statement: parsed.statement,
      options: parsed.options,
      correctAnswer,
      type: parsed.type,
      year: parsed.year,
      exam: parsed.exam,
      questionRef: parsed.sourceId,
      marks: parsed.marks ?? 1,
      negativeMarks: parsed.negativeMarks ?? 0,
      subjectHint: SUBJECT_SLUG_TO_CODE[subjectSlug] ?? null,
      mappingHints: [
        // The chapter slug is the site's own topic taxonomy, and it matches the
        // syllabus vocabulary far more closely than the exam paper's phrasing.
        { text: unit.id.replace(/-/g, " "), kind: "section-title" },
        { text: link.preview.slice(0, 160), kind: "chapter-title" },
      ],
      sourceTags: [subjectSlug],
      rawText: [parsed.statement, ...parsed.options.map((o) => `${o.id}) ${o.text}`)].join("\n"),
      page: null,
      artifactUrl: parsed.figures[0]?.url ?? null,
      sourceUrl: link.url,
      errors,
      provenance: [
        { url: link.url, kind: "question" },
        { url: `${ORIGIN}/api/check_answer`, kind: "answer-key" },
      ],
      extractionConfidence: errors.length ? 0.5 : 0.95,
    };
  }

  private failed(
    link: { url: string; preview: string },
    unit: SourceUnit,
    subjectSlug: string,
    message: string
  ): ExtractedQuestion {
    return {
      sourceQuestionId: link.url,
      statement: link.preview,
      rawText: link.preview,
      errors: [message],
      provenance: [{ url: link.url, kind: "question" }],
      extractionConfidence: 0,
      subjectHint: SUBJECT_SLUG_TO_CODE[subjectSlug] ?? null,
      mappingHints: [{ text: unit.id.replace(/-/g, " "), kind: "section-title" }],
      sourceTags: [subjectSlug],
      sourceUrl: link.url,
    };
  }
}

// Referenced so the sitemap index stays discoverable if the chapters sitemap
// URL ever moves: adapters should follow the site's advertised structure.
export const EXAM_SIDE_SITEMAP_INDEX = SITEMAP_INDEX;
