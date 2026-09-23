import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  chaptersFromSitemap,
  parseChapterUrl,
  parseQuestionPage,
  questionLinksFromChapter,
} from "@/server/domains/ingestion/sources/examside.adapter";
import { isAllowed, parseRobots, USER_AGENT } from "@/server/domains/ingestion/sources/http";
import { decodeEntities, hasFormulaGap, innerOf, textOf } from "@/server/domains/ingestion/sources/html";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "tests", "fixtures", name), "utf-8");

const chapterHtml = fixture("examside-chapter.html");
const questionHtml = fixture("examside-question.html");
const mathHtml = fixture("examside-question-math.html");
const natHtml = fixture("examside-question-nat.html");
const sitemapXml = fixture("examside-chapters-sitemap.xml");

// Real URLs for the saved pages. The trailing 16-char token is the stable
// identity; the parser reads the answer-key id from the markup itself.
const Q_2013 =
  "https://questions.examside.com/past-years/gate/question/an-index-is-clustered-if-gate-cse-2013-marks-1-iaxdvon1cxbr7moq.htm";
const Q_2016 =
  "https://questions.examside.com/past-years/gate/question/which-of-the-following-is-not-a-superkey-in-a-relational-sch-2016-set-1-marks-1-uqwi5fhah1utccst.htm";
const Q_2014 =
  "https://questions.examside.com/past-years/gate/question/given-an-instance-of-the-students-relation-as-shown-below-fo-gate-cse-2014-set-2-marks-1-cgtokgxqifytv6wq.htm";

describe("parseChapterUrl", () => {
  it("splits a GATE CSE chapter URL into subject and chapter", () => {
    const parsed = parseChapterUrl(
      "https://questions.examside.com/past-years/gate/gate-cse/database-management-system/er-diagrams"
    );
    expect(parsed).toEqual({
      url: "https://questions.examside.com/past-years/gate/gate-cse/database-management-system/er-diagrams",
      subjectSlug: "database-management-system",
      chapterSlug: "er-diagrams",
    });
  });

  it("returns null for a non-GATE-CSE URL", () => {
    expect(parseChapterUrl("https://questions.examside.com/past-years/jee/mht-cet/physics/x")).toBeNull();
  });
});

describe("chaptersFromSitemap", () => {
  it("extracts only GATE CSE chapters from the real sitemap", () => {
    const chapters = chaptersFromSitemap(sitemapXml);
    expect(chapters.length).toBe(66);
    expect(chapters.every((c) => c.url.includes("/gate/gate-cse/"))).toBe(true);
    const subjects = new Set(chapters.map((c) => c.subjectSlug));
    expect(subjects).toContain("database-management-system");
    expect(subjects).toContain("operating-systems");
    // JEE/medical chapters in the same sitemap must be excluded.
    expect([...subjects].some((s) => s.includes("physics"))).toBe(false);
  });
});

describe("questionLinksFromChapter", () => {
  it("extracts every listed question with its preview text", () => {
    const links = questionLinksFromChapter(chapterHtml);
    expect(links.length).toBe(16);
    expect(links[0]?.url).toMatch(/^https:\/\/questions\.examside\.com\/past-years\/gate\/question\//);
    expect(links[0]?.preview.length).toBeGreaterThan(10);
  });
});

describe("parseQuestionPage", () => {
  it("parses the page's own question, not a neighbouring one on the same page", () => {
    const parsed = parseQuestionPage(questionHtml, Q_2013);
    expect(parsed).not.toBeNull();
    expect(parsed!.statement).toBe("An index is clustered, if");
    // The page also embeds a GATE CSE 2012 question for navigation; picking the
    // wrong block would surface that year here.
    expect(parsed!.exam).toBe("GATE CSE 2013");
    expect(parsed!.year).toBe(2013);
  });

  it("reads all four options with their letters and text", () => {
    const parsed = parseQuestionPage(questionHtml, Q_2013)!;
    expect(parsed.options.map((o) => o.id)).toEqual(["A", "B", "C", "D"]);
    expect(parsed.options[0]!.text).toBe("It is on a set of fields that form a candidate key.");
    expect(parsed.options[3]!.text.length).toBeGreaterThan(20);
    expect(parsed.optionCount).toBe(4);
  });

  it("reads marks and the negative-marking penalty", () => {
    const parsed = parseQuestionPage(questionHtml, Q_2013)!;
    expect(parsed.marks).toBe(1);
    expect(parsed.negativeMarks).toBe(0.33);
    expect(parsed.type).toBe("MCQ");
  });

  it("recovers inline math from the MathJax SVG glyph runs", () => {
    // A formula is not text in the HTML; without recovery the statement loses
    // the attributes and reads as a different question.
    const parsed = parseQuestionPage(mathHtml, Q_2016)!;
    expect(parsed.statement).toContain("𝑉,𝑊,𝑋,𝑌,𝑍");
    expect(parsed.options[0]!.text).toBe("𝑉𝑋𝑌𝑍");
    expect(parsed.statement).not.toContain("\uFFFD");
  });

  it("reads a numerical question's type and the figure it depends on", () => {
    const parsed = parseQuestionPage(natHtml, Q_2014)!;
    expect(parsed.type).toBe("NAT");
    expect(parsed.figures.length).toBe(1);
    expect(parsed.figures[0]!.url).toMatch(/^https:\/\//);
  });

  it("uses the page's own answer-key id, which differs from the URL slug", () => {
    const parsed = parseQuestionPage(questionHtml, Q_2013)!;
    expect(parsed.sourceId).toBe("iaxdvon1cxbr7moq");
    expect(parsed.answerKeyId).toBe("IaxDvOn1CxBr7Moq");
  });

  it("rejects a page whose own question does not match its title", () => {
    // Guards against the site reordering the page: better to fail than to
    // attribute a question to the wrong exam.
    const tampered = questionHtml.replace("<title>GATE CSE 2013", "<title>GATE CSE 1999");
    expect(parseQuestionPage(tampered, Q_2013)).toBeNull();
  });

  it("returns null for a qid that is not on the page", () => {
    expect(parseQuestionPage(questionHtml, "https://x/no-id-here")).toBeNull();
  });
});

describe("robots.txt handling", () => {
  const robots = [
    "User-agent: *",
    "Allow: /",
    "",
    "User-agent: GPTBot",
    "Disallow: /",
    "",
  ].join("\n");

  it("allows paths for our identified agent", () => {
    const rules = parseRobots(robots, USER_AGENT);
    expect(isAllowed(rules, "/past-years/gate/gate-cse/database-management-system")).toBe(true);
  });

  it("honours a disallow for a different agent (GPTBot) without applying it to us", () => {
    // Our agent token must not match "gptbot", so the GPTBot group is ignored.
    const rules = parseRobots(robots, USER_AGENT);
    expect(rules.disallow).toEqual([]);
  });

  it("blocks a path when our own agent is disallowed", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /private", "anything");
    expect(isAllowed(rules, "/private/x")).toBe(false);
    expect(isAllowed(rules, "/public")).toBe(true);
  });

  it("lets a specific Allow override a broader Disallow", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /a\nAllow: /a/b", "anything");
    expect(isAllowed(rules, "/a/b/c")).toBe(true);
    expect(isAllowed(rules, "/a/c")).toBe(false);
  });

  it("reads crawl-delay into milliseconds", () => {
    const rules = parseRobots("User-agent: *\nCrawl-delay: 2", "anything");
    expect(rules.crawlDelayMs).toBe(2000);
  });
});

describe("html helpers", () => {
  it("strips tags and decodes entities", () => {
    expect(textOf("<p>a &lt; b &amp;&amp; c</p>")).toBe("a < b && c");
    expect(decodeEntities("&nbsp;x&minus;y")).toBe(" x−y");
  });

  it("keeps block boundaries from running words together", () => {
    expect(textOf("first<br>second")).toBe("first second");
    expect(textOf("<p>one</p><p>two</p>")).toBe("one two");
  });

  it("finds the inner html of a nested container", () => {
    const html = '<div class="q"><div class="q">inner</div>tail</div>';
    expect(innerOf(html, /<div class="q"[^>]*>/i)).toBe('<div class="q">inner</div>tail');
  });

  it("flags a statement whose formula could not be recovered", () => {
    expect(hasFormulaGap("attributes \uFFFD and key")).toBe(true);
    expect(hasFormulaGap("Solve for x")).toBe(false);
  });
});
