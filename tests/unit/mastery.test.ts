import { describe, expect, it } from "vitest";
import {
  EMPTY_STATS,
  applyAnswer,
  applyBatchEvidence,
  applyWeakFlag,
  computeRetention,
  markCovered,
} from "../../server/domains/mastery/mastery.math";
import { DEFAULT_MASTERY_CONFIG } from "../../server/domains/mastery/mastery.config";
import {
  DEFAULT_LADDER_DAYS,
  initialReviewAfterStudy,
  scheduleNextReview,
} from "../../server/domains/revision/revision.schedule";

const t0 = new Date("2026-09-19T10:00:00Z");
const days = (n: number) => new Date(t0.getTime() + n * 86_400_000);
const out = (correct: boolean, extra = {}) => ({ correct, isPyq: false, at: t0, ...extra });

describe("applyAnswer (EMA v1)", () => {
  it("starts from the prior and moves alpha of the way to the result", () => {
    const s = applyAnswer(null, out(true));
    expect(s.mastery).toBeCloseTo(0.65, 10); // 0.5 + 0.3 * (1 - 0.5)
    expect(s.recentAccuracy).toBe(1);
    expect(s.attempts).toBe(1);
    expect(s.correct).toBe(1);
    expect(s.completion).toBe(DEFAULT_MASTERY_CONFIG.completionOnFirstAttempt);
    expect(s.retention).toBeCloseTo(0.65, 10);
  });

  it("drops mastery on a wrong answer and counts the mistake", () => {
    const s = applyAnswer(applyAnswer(null, out(true)), out(false));
    expect(s.mastery).toBeCloseTo(0.455, 10); // 0.65 + 0.3 * (0 - 0.65)
    expect(s.recentAccuracy).toBeCloseTo(0.5, 10);
    expect(s.mistakes).toBe(1);
    expect(s.attempts).toBe(2);
  });

  it("tracks PYQ attempts separately", () => {
    const s = applyAnswer(null, { correct: true, isPyq: true, at: t0 });
    expect(s.pyqAttempts).toBe(1);
    expect(s.pyqCorrect).toBe(1);
    const w = applyAnswer(s, { correct: false, isPyq: true, at: t0 });
    expect(w.pyqAttempts).toBe(2);
    expect(w.pyqCorrect).toBe(1);
  });

  it("keeps a running mean of response time", () => {
    const s = applyAnswer(applyAnswer(null, out(true, { timeMs: 100 })), out(true, { timeMs: 200 }));
    expect(s.averageTimeMs).toBeCloseTo(150, 10);
  });

  it("smooths normalised confidence (1..4 -> 0..1)", () => {
    const s = applyAnswer(applyAnswer(null, out(true, { confidence: 4 })), out(true, { confidence: 1 }));
    expect(s.confidence).toBeCloseTo(0.7, 10); // 1 + 0.3 * (0 - 1)
  });

  it("stays within 0..1 and never mutates its input", () => {
    let s = EMPTY_STATS;
    for (let i = 0; i < 50; i++) s = applyAnswer(s, out(true));
    expect(s.mastery).toBeLessThanOrEqual(1);
    expect(EMPTY_STATS.attempts).toBe(0);
  });
});

describe("retention", () => {
  it("is null without evidence", () => {
    expect(computeRetention(null, t0, days(3))).toBeNull();
    expect(computeRetention(0.8, null, days(3))).toBeNull();
  });
  it("decays as mastery * exp(-days / tau)", () => {
    expect(computeRetention(0.8, t0, days(14))).toBeCloseTo(0.8 * Math.exp(-1), 10);
  });
  it("does not go negative-time", () => {
    expect(computeRetention(0.8, days(2), t0)).toBeCloseTo(0.8, 10);
  });
});

describe("applyBatchEvidence (Quick Study Report)", () => {
  it("equals n sequential EMA steps for a constant result", () => {
    let seq = applyAnswer(null, out(true));
    seq = applyAnswer(seq, out(true));
    seq = applyAnswer(seq, out(true));
    const batch = applyBatchEvidence(null, { attempted: 3, correct: 3, weight: 1 }, t0);
    expect(batch.mastery).toBeCloseTo(seq.mastery as number, 10);
  });

  it("does not touch app-verified attempt counters", () => {
    const s = applyBatchEvidence(null, { attempted: 20, correct: 14, weight: 0.5 }, t0);
    expect(s.attempts).toBe(0);
    expect(s.correct).toBe(0);
    expect(s.mastery).not.toBeNull();
  });

  it("moves mastery less when weighted down", () => {
    const full = applyBatchEvidence(null, { attempted: 10, correct: 10, weight: 1 }, t0);
    const half = applyBatchEvidence(null, { attempted: 10, correct: 10, weight: 0.5 }, t0);
    expect(half.mastery as number).toBeLessThan(full.mastery as number);
  });

  it("is a no-op for empty batches", () => {
    expect(applyBatchEvidence(null, { attempted: 0, correct: 0, weight: 1 }, t0)).toEqual(EMPTY_STATS);
  });
});

describe("weak flag and coverage", () => {
  it("weak flag lowers mastery", () => {
    const strong = applyBatchEvidence(null, { attempted: 10, correct: 10, weight: 1 }, t0);
    const flagged = applyWeakFlag(strong, t0);
    expect(flagged.mastery as number).toBeLessThan(strong.mastery as number);
  });
  it("markCovered raises but never lowers completion", () => {
    const a = markCovered(null, 1, t0);
    expect(a.completion).toBe(1);
    expect(markCovered(a, 0.2, t0).completion).toBe(1);
    expect(a.mastery).toBeNull(); // coverage is not mastery
  });
});

describe("revision ladder", () => {
  it("first correct answer goes to stage 1 (3 days), first miss to stage 0 (1 day)", () => {
    const ok = scheduleNextReview(null, true, t0);
    expect(ok.stage).toBe(1);
    expect(ok.dueAt.getTime()).toBe(days(3).getTime());
    const miss = scheduleNextReview(null, false, t0);
    expect(miss.stage).toBe(0);
    expect(miss.lapses).toBe(0);
    expect(miss.dueAt.getTime()).toBe(days(1).getTime());
  });

  it("climbs only when the review is actually due", () => {
    const first = scheduleNextReview(null, true, t0); // stage 1, due t0+3d
    const early = scheduleNextReview(first, true, days(1));
    expect(early.stage).toBe(1);
    expect(early.dueAt.getTime()).toBe(first.dueAt.getTime());
    const onTime = scheduleNextReview(first, true, days(3));
    expect(onTime.stage).toBe(2);
    expect(onTime.dueAt.getTime()).toBe(days(3 + 7).getTime());
  });

  it("resets and records a lapse when an established item is missed", () => {
    const s = { stage: 3, lapses: 0, dueAt: days(1), lastReviewedAt: t0 };
    const miss = scheduleNextReview(s, false, days(1));
    expect(miss.stage).toBe(0);
    expect(miss.lapses).toBe(1);
  });

  it("caps at the top of the ladder", () => {
    const top = DEFAULT_LADDER_DAYS.length - 1;
    const s = { stage: top, lapses: 0, dueAt: t0, lastReviewedAt: null };
    expect(scheduleNextReview(s, true, days(40)).stage).toBe(top);
  });

  it("schedules a first review a day after study", () => {
    expect(initialReviewAfterStudy(t0).dueAt.getTime()).toBe(days(1).getTime());
  });
});
