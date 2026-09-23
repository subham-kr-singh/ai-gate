import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  matchKeyToQuestion,
  parseArchiveIndex,
} from "@/server/domains/ingestion/sources/official-archive.adapter";
import { parsePdf } from "@/server/domains/ingestion/pdf-parser";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "tests", "fixtures", name), "utf-8");

const ORIGIN = "https://gate2026.iitg.ac.in";

describe("parseArchiveIndex", () => {
  const html = fixture("official-archive-index.html");

  it("pairs each paper with its answer key and resolves absolute URLs", () => {
    const links = parseArchiveIndex(html, ORIGIN);
    expect(links.map((l) => l.code)).toEqual(["AE", "CS1", "CS2", "PH"]);

    const cs1 = links.find((l) => l.code === "CS1")!;
    expect(cs1.paperUrl).toBe(`${ORIGIN}/doc/download/2026/QPs/CS1.pdf`);
    expect(cs1.keyUrl).toBe(`${ORIGIN}/doc/download/2026/Keys/CS1_Keys.pdf`);
  });

  it("decodes entities in the human label", () => {
    const links = parseArchiveIndex(html, ORIGIN);
    const cs1 = links.find((l) => l.code === "CS1")!;
    expect(cs1.label).toBe(
      "Computer Science & Information Technology (CS-1) (Forenoon)"
    );
  });

  it("ignores rows that are not paper downloads", () => {
    const links = parseArchiveIndex(
      "<table><tr><td><a href=\"/instructions.html\">Instructions</a></td></tr></table>",
      ORIGIN
    );
    expect(links).toEqual([]);
  });

  it("leaves keyUrl null when a row prints no key, rather than inventing one", () => {
    const links = parseArchiveIndex(
      `<table><tr><td><a href="doc/download/2026/QPs/XX.pdf">XX</a></td></tr></table>`,
      ORIGIN
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.keyUrl).toBeNull();
  });
});

/** The real GATE 2026 CS-1 key rows that exercised the parser, kept verbatim
 * so a regression in the row regex is caught here rather than in a live run. */
const KEY_TEXT = `
1 3 MCQ GA B 1
24 3 MSQ CS-1 A;C;D 2
32 3 NAT CS-1 3 to 3 1
55 3 NAT CS-1 0.5 to 0.75 2
`;

/** Builds the minimal shape `matchKeyToQuestion` reads. Only `marks` and the
 * printed option labels matter to it. */
function question(marks: number, optionLabels = ["A", "B", "C", "D"]) {
  return {
    number: 1,
    section: "PAPER" as const,
    statement: "text",
    options: optionLabels.map((l) => ({ id: l, text: l })),
    optionLabels,
    page: 1,
    hasImageContent: false,
    marks,
  };
}

describe("matchKeyToQuestion", () => {
  it("keeps the marks the paper's banner declared", () => {
    expect(matchKeyToQuestion(question(2), "MCQ", "B").marks).toBe(2);
    expect(matchKeyToQuestion(question(1), "MCQ", "B").marks).toBe(1);
  });

  it("accepts a single-option MSQ key, which GATE issues legally", () => {
    const out = matchKeyToQuestion(question(2), "MSQ", "C");
    expect(out.correctAnswer).toEqual(["C"]);
    expect(out.errors).toEqual([]);
  });

  it("splits a multi-option MSQ key on the source's separators", () => {
    expect(matchKeyToQuestion(question(2), "MSQ", "A;C;D").correctAnswer).toEqual([
      "A",
      "C",
      "D",
    ]);
  });

  it("reads an NAT range into natTolerance, and a degenerate range as one value", () => {
    const range = matchKeyToQuestion(question(1), "NAT", "0.5 to 0.75");
    expect(range.natTolerance).toEqual({ min: 0.5, max: 0.75 });
    expect(range.correctAnswer).toBe("0.5 to 0.75");

    const point = matchKeyToQuestion(question(1), "NAT", "3 to 3");
    expect(point.natTolerance).toEqual({ min: 3, max: 3 });
    expect(point.correctAnswer).toBe("3");
    expect(point.errors).toEqual([]);
  });

  it("flags a key naming an option the paper does not print", () => {
    const out = matchKeyToQuestion(question(1, ["A", "B"]), "MCQ", "D");
    expect(out.errors.join(" ")).toMatch(/does not print/);
  });

  it("reports nothing for a missing key, leaving it to the assembler", () => {
    const out = matchKeyToQuestion(question(1), "MCQ", undefined);
    expect(out.correctAnswer).toBeUndefined();
    expect(out.errors).toEqual([]);
  });

  it("rejects a non-numeric key on an NAT question", () => {
    const out = matchKeyToQuestion(question(1), "NAT", "B");
    expect(out.errors.join(" ")).toMatch(/not a numeric range/);
  });
});

/**
 * End-to-end against the real downloaded paper, when the cache is present.
 *
 * Skipped rather than failed when the PDF has not been fetched: the fixture
 * is a 2 MB government PDF that must not be committed, so CI has no copy.
 * Run `npx tsx scripts/ingest.ts --source official-archive --list` first to
 * populate `.cache/ingest-pdfs`.
 */
const PAPER = path.join(
  process.cwd(),
  ".cache",
  "ingest-pdfs",
  createHash("sha256")
    .update("https://gate2026.iitg.ac.in/doc/download/2026/QPs/CS1.pdf")
    .digest("hex")
    .slice(0, 24) + ".pdf"
);
const hasPaper = existsSync(PAPER);

describe.skipIf(!hasPaper)("official paper extraction (cached PDF)", () => {
  it("finds every CS-1 question and recovers the justified word spacing", async () => {
    const { parsePaperText } = await import(
      "@/server/domains/ingestion/sources/official-archive.adapter"
    );
    const parsed = await parsePdf(PAPER);
    const questions = parsePaperText(parsed);

    expect(questions).toHaveLength(65);
    const q1 = questions.find((q) => q.number === 1)!;
    expect(q1.statement).toBe("The antonym of the word protagonist is ________.");
    expect(q1.section).toBe("GA");
    // The word-space bug glued these into "knock-outwomen’sbadminton".
    const all = questions.map((q) => q.statement).join(" ");
    expect(all).toContain("knock-out women’s badminton");
  });

  it("gives two marks to the questions the banner marks as two-mark", async () => {
    const { parsePaperText } = await import(
      "@/server/domains/ingestion/sources/official-archive.adapter"
    );
    const questions = parsePaperText(await parsePdf(PAPER));
    expect(questions.find((q) => q.number === 6)!.marks).toBe(2);
    expect(questions.find((q) => q.number === 1)!.marks).toBe(1);
  });
});
