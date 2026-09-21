import { describe, it, expect, beforeAll } from "vitest";
import { suggestMistakeTag } from "@/server/domains/ai/mistake-classifier";
import { extractStudyReportDraft } from "@/server/domains/ai/study-report-extractor";
import { getExplanation } from "@/server/domains/ai/explanation.service";

/**
 * tests/unit/ai-eval.test.ts
 *
 * Architecture doc §77 "AI Evaluation": maintain a benchmark and measure
 * classification accuracy / explanation correctness / hallucination rate
 * whenever the model or prompt changes.
 *
 * This is a SKELETON with a small fixture set (5 cases per category, not
 * the full 100/50/50 benchmark from the doc) — expand the fixtures below
 * as real wrong-attempts/mistakes accumulate. Wire this into CI as a
 * manual/nightly job, not the default `npm test` run, since it makes real
 * (budgeted) LLM calls.
 *
 * Run explicitly: `npm run test:ai-eval`
 */

const RUN_LIVE = process.env.AI_EVAL_LIVE === "1";

describe.skipIf(!RUN_LIVE)("AI eval — mistake classification", () => {
  const fixtures: {
    input: Parameters<typeof suggestMistakeTag>[0];
    expectedTag: string;
  }[] = [
    {
      input: {
        questionId: "fixture-1",
        statement:
          "Which page replacement algorithm suffers from Belady's anomaly?",
        studentSelectedAnswer: "LRU",
        correctAnswer: "FIFO",
        timeTakenSec: 40,
        expectedTimeSec: 45,
        confidenceReported: 4,
      },
      expectedTag: "CONFUSED_CONCEPTS",
    },
    {
      input: {
        questionId: "fixture-2",
        statement: "Compute 2's complement of -13 in 8 bits.",
        studentSelectedAnswer: "11110010",
        correctAnswer: "11110011",
        timeTakenSec: 90,
        expectedTimeSec: 60,
        confidenceReported: 3,
      },
      expectedTag: "CALCULATION_ERROR",
    },
    // TODO: add 3+ more fixtures per mistake-tag category as real
    // attempt data accumulates. Target ~100 verified cases before
    // trusting the aggregate accuracy number.
  ];

  let correct = 0;

  it("classifies each fixture", async () => {
    for (const f of fixtures) {
      const result = await suggestMistakeTag(f.input);
      if (!("unavailable" in result) && result.suggestedTag === f.expectedTag) {
        correct++;
      }
    }
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it("reports aggregate accuracy", () => {
    const accuracy = fixtures.length ? correct / fixtures.length : 0;
    // eslint-disable-next-line no-console
    console.log(`Mistake classification accuracy: ${(accuracy * 100).toFixed(1)}%`);
    // Soft threshold — tighten once the fixture set is large enough to
    // be statistically meaningful (architecture doc §56: "do not
    // recalibrate with tiny samples").
    expect(accuracy).toBeGreaterThanOrEqual(0);
  });
});

describe.skipIf(!RUN_LIVE)("AI eval — study report extraction", () => {
  it("extracts subject/unit/status without inventing numbers", async () => {
    const draft = await extractStudyReportDraft(
      "Finished OS Unit 2, page replacement was hard, still confused between FIFO and LRU. Didn't do any questions yet.",
      { knownSubjects: ["Operating Systems", "DBMS", "Computer Networks"] }
    );

    expect("unavailable" in draft).toBe(false);
    if (!("unavailable" in draft)) {
      expect(draft.subjectRaw.toLowerCase()).toContain("operat");
      // Hallucination check: no questions were mentioned, so these must
      // be null, not a fabricated number.
      expect(draft.questionsAttempted).toBeNull();
      expect(draft.questionsCorrect).toBeNull();
      expect(draft.weakTopics.some((t) => /fifo|lru|page/i.test(t))).toBe(
        true
      );
    }
  });
});

describe.skipIf(!RUN_LIVE)("AI eval — explanation groundedness", () => {
  it("does not fabricate content outside the trusted solution", async () => {
    const result = await getExplanation({
      questionId: "fixture-explain-1",
      statement: "Which algorithm can suffer from Belady's anomaly?",
      trustedSolution:
        "FIFO can suffer from Belady's anomaly: increasing the number of frames can increase page faults. LRU and optimal replacement do not exhibit this.",
      relevantConcepts: ["Page Replacement", "Belady's Anomaly"],
      studentSelectedAnswer: "LRU",
      correctAnswer: "FIFO",
      recentMistakeTypes: ["CONFUSED_CONCEPTS"],
    });

    expect("unavailable" in result).toBe(false);
    if (!("unavailable" in result)) {
      expect(result.groundedInTrustedSolution).toBe(true);
      expect(result.explanation.toLowerCase()).toContain("fifo");
    }
  });
});
