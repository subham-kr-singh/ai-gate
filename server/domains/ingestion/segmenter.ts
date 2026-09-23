import type { ParsedPdf } from "./pdf-parser";

export interface TocTopic {
  section: string; // "1.1"
  title: string; // "Balls In Bins"
  expectedCount: number | null; // from "(4)" in the TOC
  page: number | null;
}

export interface TocChapter {
  number: number;
  title: string; // "Discrete Mathematics: Combinatory"
  expectedCount: number | null;
  page: number | null;
  topics: TocTopic[];
}

export interface QuestionBlock {
  /** GO's `chapter.section.question` id, e.g. "1.1.2". */
  id: string;
  chapter: number;
  chapterTitle: string | null;
  section: string;
  sectionTitle: string | null;
  topicTitle: string | null;
  /** "GATE CSE 2002" — the exam label GO prints in the block header. */
  examLabel: string | null;
  year: number | null;
  /** GO's own question reference within the exam, e.g. "13" or "2.15". */
  questionRef: string | null;
  statement: string;
  /** Option cells with the label they were printed under. Labels are kept
   * because GO sometimes lays options out in a 2x2 grid where the reading
   * order of labels is not A,B,C,D — mapping an answer letter to a position
   * requires the printed label, not the array index. */
  options: { label: string; text: string }[];
  /** GO's metadata tags from the line under the block, e.g. ["normal","descriptive"]. */
  tags: string[];
  rawBlockText: string;
  /** True when any line of this block contained a rasterised formula/table.
   * Such a block cannot be published as-is: the missing math would silently
   * change the meaning of the question. */
  hasImageContent: boolean;
  imageLineCount: number;
  startPage: number;
  endPage: number;
  lineIndex: number;
}

export interface SegmentedVolume {
  chapters: TocChapter[];
  blocks: QuestionBlock[];
  /** qid -> raw answer-key cell value, e.g. "A", "A;C", "195:195", "N/A". */
  answers: Map<string, string>;
  bodyStartPage: number;
}

const QUESTION_START_RE = /^(\d+)\.(\d+)\.(\d+)\s*(.*)$/;
const SECTION_HEADING_RE = /^(\d+\.\d+)\s+(.+?)\((\d+)\)\s*$/;
const CHAPTER_HEADING_RE = /^(\d+)\s+([A-Za-z].*?)\((\d+)\)\s*$/;
const ANSWER_APPENDIX_RE = /^Answer Keys\s*$/;
/** The inline marker GO prints under every question; not an appendix heading. */
const INLINE_ANSWER_RE = /^Answer key\s*[\u261F\u261E\u261D\u261C\u2610-\u2612\u2600-\u26FF]?\s*$/;
const METADATA_LINE_RE = /^[a-z][a-z0-9-]*(\s+[a-z][a-z0-9-]*){2,}$/;


interface Line {
  text: string;
  page: number;
  hasImage: boolean;
}

function collectLines(parsed: ParsedPdf): Line[] {
  const out: Line[] = [];
  for (const page of parsed.pages) {
    for (const line of page.lines)
      out.push({ text: line.text.replace(/\s+$/, ""), page: page.pageNumber, hasImage: line.hasImage });
  }
  return out;
}

/** Parses the front-matter table of contents into chapters + topics. */
function parseToc(frontMatter: Line[]): TocChapter[] {
  const chapters: TocChapter[] = [];
  const byNumber = new Map<number, TocChapter>();

  for (const line of frontMatter) {
    const text = line.text.trim();
    // TOC rows end with the page number: "1 Algorithms (334)    7"
    const chapter = /^(\d+)\s+([A-Za-z].*?)\((\d+)\)\s+(\d+)\s*$/.exec(text);
    if (chapter) {
      const number = Number(chapter[1]!);
      if (!byNumber.has(number)) {
        const entry: TocChapter = {
          number,
          title: chapter[2]!.trim(),
          expectedCount: Number(chapter[3]!),
          page: Number(chapter[4]!),
          topics: [],
        };
        byNumber.set(number, entry);
        chapters.push(entry);
      }
      continue;
    }
    const section = /^(\d+\.\d+)\s+(.+?)\((\d+)\)\s+(\d+)\s*$/.exec(text);
    if (section) {
      const chapterNumber = Number(section[1]!.split(".")[0]);
      const chapterEntry = byNumber.get(chapterNumber);
      if (!chapterEntry) continue;
      if (chapterEntry.topics.some((t) => t.section === section[1]!)) continue;
      chapterEntry.topics.push({
        section: section[1]!,
        title: section[2]!.trim(),
        expectedCount: Number(section[3]!),
        page: Number(section[4]!),
      });
    }
  }
  return chapters;
}

/** Extracts `qid -> answer` pairs from every "Answer Keys" appendix table. */
function parseAnswerKey(stream: Line[]): { answers: Map<string, string>; appendixIdx: Set<number> } {
  const answers = new Map<string, string>();
  const appendixIdx = new Set<number>();
  let inAppendix = false;

  for (let i = 0; i < stream.length; i++) {
    const text = stream[i]!.text;
    if (ANSWER_APPENDIX_RE.test(text.trim())) {
      inAppendix = true;
      appendixIdx.add(i);
      continue;
    }
    if (!inAppendix) continue;

    // A chapter heading ends the appendix and starts the next chapter.
    if (CHAPTER_HEADING_RE.test(text.trim())) {
      inAppendix = false;
      continue;
    }
    if (!/\d+\.\d+\.\d+/.test(text)) continue;
    appendixIdx.add(i);

    // Rows pack several qid/answer pairs per line, and the answer value may
    // itself contain spaces (`197.9 : 198.1`) or tabs. Splitting the row on
    // the *next qid* instead of on whitespace keeps multi-token answers whole,
    // which splitting on column gaps did not.
    const qidRe = /(\d+\.\d+\.\d+)/g;
    const marks: { qid: string; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = qidRe.exec(text)) !== null) marks.push({ qid: m[1]!, end: m.index + m[1]!.length });

    for (let k = 0; k < marks.length; k++) {
      const qid = marks[k]!.qid;
      const valueEnd = k + 1 < marks.length ? marks[k + 1]!.end - marks[k + 1]!.qid.length : text.length;
      const raw = text.slice(marks[k]!.end, valueEnd);
      const value = raw
        .replace(/[\u2610-\u2612\u261C-\u261F\u2600-\u26FF]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (value && value.toUpperCase() !== "N/A" && !answers.has(qid)) answers.set(qid, value);
      // N/A is a real answer-key entry (the source marks the question as having
      // no single answer) and must be recorded so the validator can report it.
      else if (value && value.toUpperCase() === "N/A" && !answers.has(qid)) answers.set(qid, "N/A");
    }
  }
  return { answers, appendixIdx };
}

function extractYear(examLabel: string | null): number | null {
  if (!examLabel) return null;
  const m = /(19|20)\d{2}/.exec(examLabel);
  return m ? Number(m[0]!) : null;
}

/**
 * Splits one printed line into its option cells.
 *
 * GO lays MCQ options either one-per-line or two-per-line (`A. x    B. y`).
 * A line carrying a second label is therefore split at every label that
 * starts a new cell; a greedy single-match would swallow B's content into A's.
 * Splitting on the label token rather than on whitespace is what keeps
 * multi-word options intact.
 */
function splitOptionCells(text: string): { label: string; text: string }[] {
  const labelRe = /(?:^|\t|\s{2,})\(?([A-E])[.)]\s*/g;
  const marks: { label: string; start: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(text)) !== null) {
    marks.push({ label: m[1]!, start: m.index, contentStart: m.index + m[0]!.length });
  }
  // A single label at position 0 with no gap markers still counts as one cell.
  if (marks.length === 0) return [];
  if (marks[0]!.start !== 0) return [];

  const cells: { label: string; text: string }[] = [];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1]!.start : text.length;
    cells.push({ label: marks[i]!.label, text: text.slice(marks[i]!.contentStart, end).trim() });
  }
  return cells;
}

/**
 * Splits extracted PDF text into per-question raw blocks.
 *
 * Layout assumptions (verified against gatecse-2026 volumes 1 and 2):
 *  - a question begins on its own line: `<c>.<s>.<q>` immediately followed
 *    by `<topic>: <exam> | Question: <ref>`
 *  - the block ends at the literal line `Answer key` + a pointer glyph
 *  - the next line is GO's tag metadata (`gatecse-2002  combinatory ...`)
 *  - answers live in an `Answer Keys` appendix at the end of each chapter,
 *    NOT only in the inline marker
 */
export function segmentVolume(parsed: ParsedPdf): SegmentedVolume {
  const allLines = collectLines(parsed);

  const firstQuestion = allLines.findIndex((l) => QUESTION_START_RE.test(l.text));
  const bodyStartPage = firstQuestion >= 0 ? allLines[firstQuestion]!.page : 1;
  // Everything before the first question is front matter (TOC, contributors,
  // syllabus preamble). It is parsed for the TOC and then discarded, so TOC
  // rows and body headings can never be confused for one another.
  const frontMatter = firstQuestion >= 0 ? allLines.slice(0, firstQuestion) : allLines;
  const stream = firstQuestion >= 0 ? allLines.slice(firstQuestion) : allLines;

  const chapters = parseToc(frontMatter);
  const { answers, appendixIdx } = parseAnswerKey(stream);

  const blocks: QuestionBlock[] = [];
  let chapterNumber = 0;
  let chapterTitle: string | null = null;
  let section = "";
  let sectionTitle: string | null = null;
  let current: QuestionBlock | null = null;
  let pendingLines: Line[] = [];


  const flush = () => {
    if (!current) return;
    const bodyLines: string[] = [];
    const options: { label: string; text: string }[] = [];
    const tags: string[] = [];

    for (const raw of pendingLines) {
      const text = raw.text.trim();
      if (!text) continue;
      if (INLINE_ANSWER_RE.test(text)) continue;

      const cells = splitOptionCells(text);
      if (cells.length > 0) {
        options.push(...cells);
        continue;
      }
      // GO's tag line sits directly under the block, after the "Answer key"
      // marker. Only treat it as metadata when it has no sentence punctuation.
      if (
        METADATA_LINE_RE.test(text) &&
        !/[.,;:?!]/.test(text) &&
        /(gate|isro|ugc|tifr|marks|one-mark|two-mark|normal|easy|medium|hard|descriptive|numerical|multiple|proof|match|fill)/i.test(text)
      ) {
        tags.push(...text.split(/\s{1,}/).filter(Boolean));
        continue;
      }
      bodyLines.push(text);
    }

    current.statement = bodyLines.join("\n").trim();
    current.options = options;
    current.tags = tags;
    current.imageLineCount = pendingLines.filter((l) => l.hasImage).length;
    current.hasImageContent = current.imageLineCount > 0;
    blocks.push(current);
    current = null;
  };

  for (let i = 0; i < stream.length; i++) {
    if (appendixIdx.has(i)) {
      flush();
      continue;
    }
    const line = stream[i]!;
    const text = line.text.trim();
    if (!text) continue;

    const qStart = QUESTION_START_RE.exec(text);
    if (qStart) {
      flush();
      const headerRest = qStart[4]!.trim();
      // "Balls In Bins: GATE CSE 2002 | Question: 13"
      const headerMatch = /^(.+?):\s*(.+?)\s*\|\s*Question:\s*(.+)$/.exec(headerRest);
      const topicTitle = headerMatch ? headerMatch[1]!.trim() : headerRest || null;
      const examLabel = headerMatch ? headerMatch[2]!.trim() : null;
      // The section heading (`7.19 Process Scheduling(48)`) is printed between
      // blocks, so a block that starts after it still needs to be told which
      // section it belongs to — track the last heading seen, not just the one
      // that arrived while no block was open.
      current = {
        id: `${qStart[1]!}.${qStart[2]!}.${qStart[3]!}`,
        chapter: Number(qStart[1]!),
        chapterTitle,
        section: `${qStart[1]!}.${qStart[2]!}`,
        sectionTitle,
        topicTitle,
        examLabel,
        year: extractYear(examLabel),
        questionRef: headerMatch ? headerMatch[3]!.trim() : null,
        statement: "",
        options: [],
        tags: [],
        rawBlockText: "",
        hasImageContent: false,
        imageLineCount: 0,
        startPage: line.page,
        endPage: line.page,
        lineIndex: i,
      };
      pendingLines = [];
      continue;
    }

    // Scoping headings appear between questions, never inside one, so they
    // close any open block first and then update the running scope.
    const chapterHeading = CHAPTER_HEADING_RE.exec(text);
    if (chapterHeading) {
      flush();
      chapterNumber = Number(chapterHeading[1]!);
      chapterTitle = chapterHeading[2]!.trim();
      section = "";
      sectionTitle = null;
      continue;
    }
    const sectionHeading = SECTION_HEADING_RE.exec(text);
    if (sectionHeading) {
      flush();
      section = sectionHeading[1]!;
      sectionTitle = sectionHeading[2]!.trim();
      continue;
    }

    if (current) {
      pendingLines.push(line);
      current.endPage = line.page;
    }
  }
  flush();

  // Build rawBlockText from the lines that actually belong to each block.
  for (let k = 0; k < blocks.length; k++) {
    const start = blocks[k]!.lineIndex;
    const end = k + 1 < blocks.length ? blocks[k + 1]!.lineIndex : stream.length;
    blocks[k]!.rawBlockText = stream
      .slice(start, end < start ? start : end)
      .map((l) => l.text)
      .join("\n")
      .trim();
  }

  return { chapters, blocks, answers, bodyStartPage };
}

/** Question blocks whose section matches a TOC topic title (case-insensitive). */
export function blocksForTopic(seg: SegmentedVolume, topicTitle: string): QuestionBlock[] {
  const needle = topicTitle.trim().toLowerCase();
  return seg.blocks.filter(
    (b) =>
      (b.sectionTitle ?? "").trim().toLowerCase() === needle ||
      (b.topicTitle ?? "").trim().toLowerCase() === needle
  );
}

export function chaptersForVolume(seg: SegmentedVolume): TocChapter[] {
  return seg.chapters;
}
