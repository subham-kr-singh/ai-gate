/**
 * server/domains/gateoverflow/gateoverflow.parse.ts
 *
 * Two pure parsers that turn a raw GATE Overflow artefact into
 * `ParsedQuestion[]`. No I/O, no database — so the tricky HTML/JSON shapes are
 * unit-testable against fixtures.
 *
 * HTML: the official book file. One `<div class="question">` per question,
 * statement inside `<div class="question-text">`, the answer choices are the
 * last multi-item `<ol>` in that block, and the answer key lives in a
 * separate `akt-table` keyed by the question's GO post id. Questions whose key
 * cell reads "Q-Q" have no key published in the book and are reported as
 * unanswered rather than guessed.
 *
 * JSON: the community mirror. One object per question with an explicit
 * `qtype`, so MCQ/MSQ/NAT are distinguished directly and NAT answers arrive
 * as a `{ low, high }` range.
 */

import type {
  ParsedAnswerKind,
  ParsedOption,
  ParsedQuestion,
} from "./gateoverflow.types";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  times: "×",
  divide: "÷",
  le: "≤",
  ge: "≥",
  ne: "≠",
  minus: "−",
  deg: "°",
};

/** Decode supported named and numeric HTML entities, preserving unrecognised or invalid matches. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(hex ? entity.slice(2) : entity.slice(1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/**
 * Images cannot be displayed by the question renderer (plain text), and the
 * HTML/JSON sources embed some diagrams as multi-megabyte base64 data URIs.
 * Both are reduced to a readable marker that keeps the remote URL when there
 * is one, instead of storing broken markup or megabytes of base64.
 */
function normaliseMedia(html: string): string {
  return html
    .replace(/<img\b[^>]*\bsrc\s*=\s*"([^"]*)"[^>]*>/gi, (_m, src: string) =>
      src.startsWith("data:") ? "[figure]" : `[figure: ${src}]`
    )
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_m, src: string) =>
      String(src).startsWith("data:") ? "[figure]" : `[figure: ${src}]`
    );
}

/** Postgres text columns reject NUL, and stray C0 controls break rendering;
 * both appear in OCR-derived corpora. Newlines and tabs are kept. */
function stripControlChars(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/** Convert corpus markup to plain text with figure markers and line breaks.
 * Remove scripts, styles and unsupported control characters, then collapse excess whitespace. */
export function htmlToText(html: string): string {
  let text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
  text = normaliseMedia(text);
  text = text.replace(/<\s*(br|hr)\s*\/?>/gi, "\n");
  text = text.replace(/<\/\s*(p|div|li|tr|h[1-6]|ol|ul|table|blockquote)\s*>/gi, "\n");
  text = text.replace(/<[^>]*>/g, "");
  text = decodeEntities(text);
  text = stripControlChars(text);
  return text
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Splits a provenance line like "Cache Memory: GATE CSE 2018 | Question: 18". */
export function splitProvenance(raw: string): {
  subtopic: string | null;
  year: number | null;
  body: string;
} {
  const newline = raw.indexOf("\n");
  const firstLine = (newline === -1 ? raw : raw.slice(0, newline)).trim();
  const rest = newline === -1 ? "" : raw.slice(newline + 1).trim();

  const questionMark = firstLine.indexOf("| Question:");
  const head = questionMark === -1 ? firstLine : firstLine.slice(0, questionMark);

  let subtopic: string | null = null;
  const colon = head.indexOf(":");
  // A subtopic label only appears on a provenance line — one carrying an exam
  // name or a year. Without that guard, any sentence with a colon would be
  // mistaken for a label.
  const hasProvenance = /\b(19|20)\d{2}\b|GATE|ISRO|NIELIT|TIFR|UGC/.test(head);
  if (hasProvenance && colon > 0 && colon <= 60) {
    const candidate = head.slice(0, colon).trim();
    // The real labels are short and title-cased; a colon deep in a sentence
    // is punctuation, not a label.
    if (candidate.length > 0 && candidate.length <= 40 && !/[.;]/.test(candidate)) {
      subtopic = candidate;
    }
  }

  const yearMatch = head.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : null;

  return { subtopic, year, body: rest.length > 0 ? rest : raw };
}

/** Read choices from the last ordered list with two to six items.
 * Return its HTML match so callers can remove it from the statement, or empty choices and null. */
function extractOptions(html: string): { options: ParsedOption[]; match: RegExpMatchArray | null } {
  const ols = [...html.matchAll(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi)];
  for (let i = ols.length - 1; i >= 0; i -= 1) {
    const ol = ols[i];
    if (!ol) continue;
    const items = [...(ol[1] ?? "").matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1] ?? "");
    if (items.length >= 2 && items.length <= 6) {
      return {
        options: items.map((item, index) => ({ id: LETTERS[index]!, text: htmlToText(item) })),
        match: ol,
      };
    }
  }
  return { options: [], match: null };
}

/** Reads the book's answer-key tables into a map keyed by GO post id. */
export function parseHtmlAnswerKeys(html: string): Map<string, string> {
  const keys = new Map<string, string>();
  const rowPattern =
    /class='akt-id' id='akt-(\d+)'[\s\S]*?class='akt-key'>([\s\S]*?)<\/td>/g;
  for (const match of html.matchAll(rowPattern)) {
    const id = match[1];
    const key = match[2];
    if (id && key) keys.set(id, htmlToText(key));
  }
  return keys;
}

/**
 * Normalises an answer-key cell to the app's answer convention.
 * "C" → MCQ option id; "A;C" → MSQ option ids; "Q-Q"/"N/A"/numeric → null,
 * because the app cannot grade what the book did not publish.
 */
export function parseAnswerKeyText(raw: string): {
  answer: string | string[] | null;
  kind: ParsedAnswerKind;
} {
  const text = raw.trim().toUpperCase();
  if (text.length === 0 || text === "Q-Q" || text === "N/A" || text === "NA" || text === "TBA") {
    return { answer: null, kind: "UNKNOWN" };
  }
  const letters = text.match(/[A-E]/g);
  if (!letters || letters.length === 0) return { answer: null, kind: "UNKNOWN" };
  const unique = [...new Set(letters)].sort();
  if (unique.length === 1) return { answer: unique[0]!, kind: "MCQ" };
  return { answer: unique, kind: "MSQ" };
}

/** Strip a chapter heading’s leading number and trailing parenthesised question count. */
function normaliseChapterName(raw: string): string {
  return raw
    .replace(/^\s*\d+\.?\s*/, "")
    .replace(/\(\s*\d+\s*\)\s*$/, "")
    .trim();
}

/** Parse book chapters into questions and join answers by GO post id.
 * Skip blocks without question text or an id; retain unknown answers for downstream reporting. */
export function parseGateOverflowHtml(html: string): ParsedQuestion[] {
  const keys = parseHtmlAnswerKeys(html);
  const questions: ParsedQuestion[] = [];

  const segments = html.split(/<h1 class="cat-name">/i);
  for (const segment of segments.slice(1)) {
    const headingEnd = segment.indexOf("</h1>");
    const chapter = normaliseChapterName(htmlToText(segment.slice(0, headingEnd === -1 ? 80 : headingEnd)));
    if (!chapter) continue;

    const blocks = segment.split('<div class="question">').slice(1);
    for (const block of blocks) {
      const questionTextMatch = block.match(
        /<div class="question-text[^"]*">([\s\S]*?)<div class="qa-q-item-tags">/i
      );
      if (!questionTextMatch) continue;
      const questionTextHtml = questionTextMatch[1] ?? "";

      const goIdMatch = block.match(/id="question(\d+)"/);
      const goId = goIdMatch?.[1] ?? null;
      const hrefMatch = block.match(/<div class="question-title">[\s\S]*?href="([^"]+)"/i);
      const href = hrefMatch?.[1] ?? (goId ? `https://gateoverflow.in/${goId}` : null);
      if (!goId || !href) continue;

      const titleHtml = block.match(/<div class="question-title">([\s\S]*?)<\/div>/i)?.[1] ?? "";
      const titleText = htmlToText(titleHtml.replace(/<span class="number">[\s\S]*?<\/span>/i, " "));
      const { year } = splitProvenance(titleText);

      const tagsHtml = block.match(/<ul class="qa-q-view-tag-list">([\s\S]*?)<\/ul>/i)?.[1] ?? "";
      const tags = [...tagsHtml.matchAll(/qa-tag-link[^>]*>([^<]+)</gi)]
        .map((m) => decodeEntities(m[1] ?? "").trim())
        .filter((tag) => tag.length > 0);

      const { options, match } = extractOptions(questionTextHtml);
      let statementHtml = questionTextHtml;
      if (match && typeof match.index === "number") {
        statementHtml =
          questionTextHtml.slice(0, match.index) +
          " " +
          questionTextHtml.slice(match.index + match[0].length);
      }
      const statement = htmlToText(statementHtml);

      const keyText = keys.get(goId) ?? null;
      const parsedKey = keyText === null ? { answer: null, kind: "UNKNOWN" as const } : parseAnswerKeyText(keyText);

      questions.push({
        sourceQuestionId: goId,
        chapter,
        subtopic: null,
        tags,
        year,
        statement,
        options,
        answer: parsedKey.answer,
        answerKind: parsedKey.kind,
        sourceUrl: href,
      });
    }
  }

  return questions;
}

interface JsonQuestion {
  id?: unknown;
  qtype?: unknown;
  question_text?: unknown;
  options?: unknown;
  answer?: unknown;
  solution?: unknown;
}

/** Return a string value unchanged, or null for any other type. */
function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Parse one mirror row, returning null when its string id or question text is missing.
 * Normalise choice answers and numeric ranges; retain unusable answers as UNKNOWN. */
function parseJsonQuestion(raw: JsonQuestion, chapter: string): ParsedQuestion | null {
  const statementRaw = asString(raw.question_text);
  const sourceUrl = asString(raw.solution);
  const id = asString(raw.id);
  if (!statementRaw || !id) return null;

  const { subtopic, year, body } = splitProvenance(statementRaw);
  const optionsRaw = Array.isArray(raw.options) ? raw.options : [];
  const qtype = asString(raw.qtype);

  if (qtype === "NAT") {
    const range = raw.answer;
    const low = typeof range === "object" && range !== null ? (range as { low?: unknown }).low : undefined;
    const high = typeof range === "object" && range !== null ? (range as { high?: unknown }).high : undefined;
    /** Accept only finite numbers as numeric-answer range bounds. */
    const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    if (!isNumber(low) || !isNumber(high)) {
      return {
        sourceQuestionId: id,
        chapter,
        subtopic,
        tags: [],
        year,
        statement: htmlToText(body),
        options: [],
        answer: null,
        answerKind: "UNKNOWN",
        sourceUrl: sourceUrl ?? "",
      };
    }
    return {
      sourceQuestionId: id,
      chapter,
      subtopic,
      tags: [],
      year,
      statement: htmlToText(body),
      options: [],
      answer: String(low),
      natTolerance: { min: Math.min(low, high), max: Math.max(low, high) },
      answerKind: "NAT",
      sourceUrl: sourceUrl ?? "",
    };
  }

  const options: ParsedOption[] = optionsRaw
    .filter((o): o is string => typeof o === "string")
    .map((text, index) => ({ id: LETTERS[index]!, text: htmlToText(text) }));

  if (qtype === "MCQ") {
    const letter = asString(raw.answer)?.trim().toUpperCase() ?? null;
    const valid = letter && /^[A-E]$/.test(letter) ? letter : null;
    return {
      sourceQuestionId: id,
      chapter,
      subtopic,
      tags: [],
      year,
      statement: htmlToText(body),
      options,
      answer: valid,
      answerKind: valid ? "MCQ" : "UNKNOWN",
      sourceUrl: sourceUrl ?? "",
    };
  }

  if (qtype === "MSQ") {
    const list = Array.isArray(raw.answer) ? raw.answer.filter((x): x is string => typeof x === "string") : [];
    const letters = [...new Set(list.map((x) => x.trim().toUpperCase()).filter((x) => /^[A-E]$/.test(x)))].sort();
    return {
      sourceQuestionId: id,
      chapter,
      subtopic,
      tags: [],
      year,
      statement: htmlToText(body),
      options,
      answer: letters.length > 0 ? letters : null,
      answerKind: letters.length > 0 ? "MSQ" : "UNKNOWN",
      sourceUrl: sourceUrl ?? "",
    };
  }

  return {
    sourceQuestionId: id,
    chapter,
    subtopic,
    tags: [],
    year,
    statement: htmlToText(body),
    options,
    answer: null,
    answerKind: "UNKNOWN",
    sourceUrl: sourceUrl ?? "",
  };
}

interface JsonVolume {
  chapters?: unknown;
}

/** Flatten mirror volumes and chapters into parsed questions.
 * Throw when the top-level volumes object is missing; skip unnamed chapters and incomplete rows. */
export function parseGateOverflowJson(payload: unknown): ParsedQuestion[] {
  const volumes = (payload as { volumes?: unknown } | null)?.volumes;
  if (!volumes || typeof volumes !== "object") {
    throw new Error("GATE Overflow JSON: expected a top-level `volumes` object.");
  }

  const questions: ParsedQuestion[] = [];
  for (const volume of Object.values(volumes as Record<string, JsonVolume>)) {
    const chapters = Array.isArray(volume?.chapters) ? volume.chapters : [];
    for (const chapter of chapters as Array<{ name?: unknown; questions?: unknown }>) {
      const chapterName = asString(chapter?.name);
      const list = Array.isArray(chapter?.questions) ? chapter.questions : [];
      if (!chapterName) continue;
      for (const raw of list) {
        const parsed = parseJsonQuestion(raw as JsonQuestion, chapterName);
        if (parsed) questions.push(parsed);
      }
    }
  }
  return questions;
}
