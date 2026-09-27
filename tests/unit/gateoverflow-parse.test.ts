import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  htmlToText,
  parseAnswerKeyText,
  parseGateOverflowHtml,
  parseGateOverflowJson,
  splitProvenance,
} from "@/server/domains/gateoverflow/gateoverflow.parse";

const HTML = `
<html><body>
<h1 class="cat-name">7 Operating System  (232)</h1>
<div class="questions">
<div class="question">
<div class="question-title"><a href="https://gateoverflow.in/1234/os-2019-question-5" id="question1234"><span class="number">1.0.1</span>OS | GATE CSE 2019 | Question: 5</a><span class="title-right"><a href="https://gateoverflow.in/1234">https://gateoverflow.in/1234</a></span></div>
<div class="question-content "><div class="question-text   ">
<p>Cache Memory: GATE CSE 2019 | Question: 5</p>
<p>Which of the following is true about a direct-mapped cache?</p>
<ol  class="shrink-inline-options" style="list-style-type:upper-alpha;"><li>It has one line per set</li>
<li>It is fully associative</li>
<li>It needs no tag bits</li>
<li>It uses LRU replacement</li>
</ol>
</div>
<div class="qa-q-item-tags">
 <ul class="qa-q-view-tag-list">
<li class="qa-q-view-tag-item"> <a href="https://gateoverflow.in/tag/os" class="qa-tag-link">os </a></li>
</ul>
</div>
</div>
<div class="answers"><a class="answer-link" href="#akt-1234">Answer key</a></div>
</div>
<div class="question">
<div class="question-title"><a href="https://gateoverflow.in/5678/os-2020-question-9" id="question5678"><span class="number">1.0.2</span>OS | GATE CSE 2020 | Question: 9</a></div>
<div class="question-content "><div class="question-text   ">
<p>Consider the following statements:</p>
<ol start="1" style="list-style-type:lower-roman"><li>Statement one</li><li>Statement two</li></ol>
<p>Which are correct?</p>
<ol  class="shrink-inline-options2" style="list-style-type:upper-alpha"><li>Only one</li><li>Only two</li><li>Both</li><li>Neither</li></ol>
</div>
<div class="qa-q-item-tags"><ul class="qa-q-view-tag-list"></ul></div>
</div>
</div>
<div class="question">
<div class="question-title"><a href="https://gateoverflow.in/9999/os-2021-question-2" id="question9999"><span class="number">1.0.3</span>OS | GATE CSE 2021 | Question: 2</a></div>
<div class="question-content "><div class="question-text   "><p>A question with no published key.</p>
<ol  class="shrink-inline-options" style="list-style-type:upper-alpha"><li>One</li><li>Two</li><li>Three</li><li>Four</li></ol>
</div>
<div class="qa-q-item-tags"><ul class="qa-q-view-tag-list"></ul></div>
</div>
</div>
</div>
<h2 class="answer-keys"> Answer Keys</h2>
<table class="akt-table"><tr>
<td class='akt-id' id='akt-1234'><a href='#question1234'>1.0.1</a></td><td class='akt-key'><a href='https://gateoverflow.in/1234#1'>A</a></td><td class='akt-gap'></td>
<td class='akt-id' id='akt-5678'><a href='#question5678'>1.0.2</a></td><td class='akt-key'><a href='https://gateoverflow.in/5678#2'>B;D</a></td><td class='akt-gap'></td>
<td class='akt-id' id='akt-9999'><a href='#question9999'>1.0.3</a></td><td class='akt-key'><a href='https://gateoverflow.in/9999#3'>Q-Q</a></td>
</tr></table>
</body></html>
`;

describe("htmlToText / decodeEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &#65; &#x42; &nbsp;")).toBe("a & b <c> A B  ");
  });

  it("turns base64 images into a short marker instead of megabytes", () => {
    const html = `<p>see <img src="data:image/jpeg;base64,AAAA" alt=""> below</p>`;
    const text = htmlToText(html);
    expect(text).toBe("see [figure] below");
    expect(text).not.toContain("base64");
  });

  it("keeps a remote image URL so the figure can still be found", () => {
    expect(htmlToText(`<img src="https://gateoverflow.in/?qa=blob&amp;qa_blobid=1">`)).toBe(
      "[figure: https://gateoverflow.in/?qa=blob&qa_blobid=1]"
    );
  });

  it("drops script and style bodies and collapses whitespace", () => {
    const text = htmlToText(`<style>.a{}</style><p>keep</p><script>var x=1;</script>`);
    expect(text).toBe("keep");
  });

  it("strips NUL and other C0 controls that Postgres rejects", () => {
    const text = htmlToText("<p>a\u0000b\u0007c\u001fd</p>");
    expect(text).toBe("abcd");
    expect(text).not.toMatch(/[\u0000\u0007\u001f]/);
  });
});

describe("splitProvenance", () => {
  it("reads subtopic and year from a GATE CSE line", () => {
    expect(splitProvenance("Cache Memory: GATE CSE 2019 | Question: 5\n\nBody text")).toEqual({
      subtopic: "Cache Memory",
      year: 2019,
      body: "Body text",
    });
  });

  it("handles a line with no year", () => {
    expect(splitProvenance("Subnetting: ISRO CSE | Question: 3\nBody").year).toBeNull();
  });

  it("does not treat a long sentence colon as a subtopic", () => {
    const { subtopic } = splitProvenance(
      "Consider the following statement: it is quite long and definitely not a label\nBody"
    );
    expect(subtopic).toBeNull();
  });
});

describe("parseAnswerKeyText", () => {
  it("maps a single letter to an MCQ answer", () => {
    expect(parseAnswerKeyText("C")).toEqual({ answer: "C", kind: "MCQ" });
  });

  it("maps a multi-letter key to MSQ, deduped and sorted", () => {
    expect(parseAnswerKeyText("D;A")).toEqual({ answer: ["A", "D"], kind: "MSQ" });
  });

  it("treats Q-Q, N/A and non-letter keys as unusable", () => {
    for (const raw of ["Q-Q", "N/A", "TBA", "", "3"]) {
      expect(parseAnswerKeyText(raw)).toEqual({ answer: null, kind: "UNKNOWN" });
    }
  });
});

describe("parseGateOverflowHtml", () => {
  const questions = parseGateOverflowHtml(HTML);

  it("parses one question per block with chapter, year and subtopic", () => {
    expect(questions).toHaveLength(3);
    expect(questions[0]).toMatchObject({
      sourceQuestionId: "1234",
      chapter: "Operating System",
      year: 2019,
      answer: "A",
      answerKind: "MCQ",
      sourceUrl: "https://gateoverflow.in/1234/os-2019-question-5",
    });
  });

  it("collects the question's tags, decoded", () => {
    expect(questions[0]!.tags).toEqual(["os"]);
    expect(questions[1]!.tags).toEqual([]);
  });

  it("keeps only the last ol as options and removes it from the statement", () => {
    const second = questions[1]!;
    expect(second.options.map((o) => o.text)).toEqual(["Only one", "Only two", "Both", "Neither"]);
    expect(second.statement).toContain("Statement one");
    expect(second.statement).toContain("Which are correct?");
    expect(second.statement).not.toContain("Only one");
  });

  it("normalises the chapter heading, stripping its number and count", () => {
    expect(questions[0]!.chapter).toBe("Operating System");
  });

  it("reports a question with no published key as unanswered", () => {
    const third = questions[2]!;
    expect(third.options).toHaveLength(4);
    expect(third.answer).toBeNull();
    expect(third.answerKind).toBe("UNKNOWN");
  });

  it("carries the MSQ key through", () => {
    expect(questions[1]!.answer).toEqual(["B", "D"]);
    expect(questions[1]!.answerKind).toBe("MSQ");
  });
});

const JSON_PAYLOAD = {
  volumes: {
    volume1: {
      id: "volume1",
      name: "Volume 1",
      chapters: [
        {
          id: "1",
          name: "Operating System",
          questions: [
            {
              id: "1.1.1",
              qtype: "MCQ",
              question_text: "Cache Memory: GATE CSE 2018 | Question: 1\n\nWhat is a cache?",
              options: ["Fast memory", "Slow memory", "Disk", "Register"],
              answer: "A",
              solution: "https://gateoverflow.in/100",
            },
            {
              id: "1.1.2",
              qtype: "NAT",
              question_text: "Pipelining: GATE CSE 2019 | Question: 2\n\nHow many cycles?",
              options: [],
              answer: { low: 7.0, high: 9.0 },
              solution: "https://gateoverflow.in/101",
            },
            {
              id: "1.1.3",
              qtype: "MSQ",
              question_text: "Subnetting: GATE CSE 2020 | Question: 3\n\nWhich are valid?",
              options: ["A", "B", "C", "D"],
              answer: ["A", "C"],
              solution: "https://gateoverflow.in/102",
            },
            {
              id: "1.1.4",
              qtype: "descriptive",
              question_text: "Disk: GATE CSE 1999 | Question: 4\n\nExplain paging.",
              options: [],
              answer: null,
              solution: "https://gateoverflow.in/103",
            },
          ],
        },
      ],
    },
  },
};

describe("parseGateOverflowJson", () => {
  const questions = parseGateOverflowJson(JSON_PAYLOAD);

  it("parses every question across volumes and chapters", () => {
    expect(questions).toHaveLength(4);
    expect(questions.every((q) => q.chapter === "Operating System")).toBe(true);
    expect(questions.every((q) => q.tags.length === 0)).toBe(true);
  });

  it("keeps MCQ options and answer letter", () => {
    expect(questions[0]).toMatchObject({ subtopic: "Cache Memory", year: 2018, answer: "A", answerKind: "MCQ" });
    expect(questions[0]!.options).toHaveLength(4);
  });

  it("turns a NAT range into a tolerance band", () => {
    expect(questions[1]).toMatchObject({ answer: "7", answerKind: "NAT", options: [] });
    expect(questions[1]!.natTolerance).toEqual({ min: 7, max: 9 });
  });

  it("keeps MSQ answers as sorted option ids", () => {
    expect(questions[2]).toMatchObject({ answer: ["A", "C"], answerKind: "MSQ" });
  });

  it("marks an unsupported qtype as unknown so it is not imported", () => {
    expect(questions[3]).toMatchObject({ answer: null, answerKind: "UNKNOWN" });
  });

  it("rejects a payload without a volumes object", () => {
    expect(() => parseGateOverflowJson({})).toThrow(/volumes/);
  });
});
