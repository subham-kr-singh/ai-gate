import { describe, expect, it } from "vitest";
import { computePace } from "@/server/domains/analytics/pace.service";
import { planToday, applyTransitions } from "@/server/domains/planner/planner.core";
import { resolvePhase, phaseWindows } from "@/server/domains/planner/phase.service";
import { evaluateExit } from "@/server/domains/planner/unit-exit";
import { classifyByDays, estimateUnitDays, estimateVelocity } from "@/server/domains/planner/velocity.service";
import { NOW, daysAgo, plan, studied, unit } from "./_fixtures";

const phase1 = resolvePhase({ todayKey: "2026-09-19", prepStartKey: "2026-09-19", examKey: "2027-02-06" });

describe("phase resolver", () => {
  it("cuts the runway into four strictly increasing windows that end on the exam date", () => {
    const w = phaseWindows("2026-09-19", "2027-02-06");
    expect(w).toHaveLength(4);
    for (let i = 1; i < 4; i++) expect(w[i]!.startKey > w[i - 1]!.startKey).toBe(true);
    expect(w[3]!.endKey).toBe("2027-02-06");
  });

  it("starts in phase 1 and reaches phase 4 near the exam", () => {
    expect(phase1.phase).toBe(1);
    expect(phase1.daysToExam).toBe(140);
    const late = resolvePhase({ todayKey: "2027-01-20", prepStartKey: "2026-09-19", examKey: "2027-02-06" });
    expect(late.phase).toBe(4);
    expect(late.daysToExam).toBe(17);
  });

  it("stays in phase 4 after the exam date", () => {
    expect(resolvePhase({ todayKey: "2027-02-10", prepStartKey: "2026-09-19", examKey: "2027-02-06" }).phase).toBe(4);
  });

  it("assumes phase 1 without an exam date", () => {
    const p = resolvePhase({ todayKey: "2026-09-19", prepStartKey: "2026-09-19", examKey: null });
    expect(p.assumed).toBe(true);
    expect(p.daysToExam).toBeNull();
  });

  it("copes with a very short runway", () => {
    const w = phaseWindows("2026-09-19", "2026-09-25");
    for (let i = 1; i < 4; i++) expect(w[i]!.startKey > w[i - 1]!.startKey).toBe(true);
    expect(w[3]!.startKey < "2026-09-25").toBe(true);
  });
});

describe("unit exit rule", () => {
  it("marks a unit with no activity as not started", () => {
    expect(evaluateExit(unit(), NOW, 1).state).toBe("NOT_STARTED");
  });

  it("does not trust reported coverage without evidence", () => {
    const s = unit({ coverage: 1, plan: plan({ status: "ACTIVE", startedAt: daysAgo(10) }) });
    expect(evaluateExit(s, NOW, 1).state).toBe("UNVERIFIED");
  });

  it("completes a unit only when evidence is strong", () => {
    const strong = studied({ mastery: 0.9, practiceAccuracy: 0.88, pyqAccuracy: 0.85, recentAccuracy: 0.9, mistakes: 1, openMistakes: 0 });
    expect(evaluateExit(strong, NOW, 2).state).toBe("PROVISIONALLY_COMPLETE");
  });

  it("does not complete a unit just because the planned days elapsed while there is time left", () => {
    const s = studied({}, { startedAt: daysAgo(1.5) });
    expect(evaluateExit(s, NOW, 2).state).toBe("CONTINUE");
  });

  it("ends in GOOD_ENOUGH at the maximum extension and keeps the weak concepts", () => {
    const s = studied(
      { weakConcepts: [{ conceptId: "lru", name: "LRU", mastery: 0.3, attempts: 8 }] },
      { startedAt: daysAgo(3.5) },
    );
    const e = evaluateExit(s, NOW, 2);
    expect(e.state).toBe("GOOD_ENOUGH");
    expect(e.unresolvedConceptIds).toEqual(["lru"]);
  });

  it("applies the phase adjustment to the bar", () => {
    const borderline = studied({ mastery: 0.72, practiceAccuracy: 0.72, pyqAccuracy: 0.72, recentAccuracy: 0.72, mistakes: 0 });
    expect(evaluateExit(borderline, NOW, 1).state).toBe("CONTINUE");
    expect(evaluateExit(borderline, NOW, 4).state).toBe("PROVISIONALLY_COMPLETE");
  });
});

describe("state transitions", () => {
  it("activates a pending unit once the student has covered part of it", () => {
    const { units, updates } = applyTransitions([unit({ coverage: 0.4 })], 1, NOW);
    expect(units[0]!.plan.status).toBe("ACTIVE");
    expect(updates[0]!.patch.status).toBe("ACTIVE");
  });

  it("retires an over-time unit as GOOD_ENOUGH and records the carry-over", () => {
    const s = studied({ weakConcepts: [{ conceptId: "fifo", name: "FIFO", mastery: 0.35, attempts: 6 }] }, { startedAt: daysAgo(4) });
    const { units, updates } = applyTransitions([s], 2, NOW);
    expect(units[0]!.plan.status).toBe("GOOD_ENOUGH");
    expect(updates[0]!.patch.unresolved?.conceptIds).toEqual(["fifo"]);
  });

  it("is idempotent once applied", () => {
    const s = studied({ weakConcepts: [{ conceptId: "fifo", name: "FIFO", mastery: 0.35, attempts: 6 }] }, { startedAt: daysAgo(4) });
    const first = applyTransitions([s], 2, NOW);
    expect(applyTransitions(first.units, 2, NOW).updates).toHaveLength(0);
  });
});

const base = { now: NOW, phase: phase1, flashcardsDue: 0, conceptReviewsDue: 0, lastMockAt: null };

describe("planToday", () => {
  it("offers only the next unit in sequence on a fresh syllabus", () => {
    const units = [
      unit({ unitId: "a", plan: plan({ sequence: 0 }) }),
      unit({ unitId: "b", plan: plan({ sequence: 1 }) }),
      unit({ unitId: "c", plan: plan({ sequence: 2 }) }),
    ];
    const out = planToday({ ...base, units });
    expect(out.primary?.unitId).toBe("a");
    expect(out.primary?.action).toBe("STUDY_CONCEPT");
    expect(out.primary?.reasons.some((r) => r.type === "NEXT_IN_SEQUENCE")).toBe(true);
    expect(out.alternatives).toHaveLength(0);
  });

  it("continues an active weak unit instead of jumping ahead", () => {
    const active = studied({ unitId: "os2", unitName: "Process Management II", coverage: 0.9, mastery: 0.45, weakConcepts: [{ conceptId: "lru", name: "LRU", mastery: 0.3, attempts: 9 }] }, { sequence: 0 });
    const next = unit({ unitId: "os3", plan: plan({ sequence: 1 }) });
    const out = planToday({ ...base, units: [active, next] });
    expect(out.primary?.unitId).toBe("os2");
    expect(["SOLVE_EASY", "SOLVE_MEDIUM"]).toContain(out.primary?.action);
    expect(out.primary?.reasons.length).toBeGreaterThan(0);
  });

  it("repairs a blocking prerequisite before assigning more questions", () => {
    const blocked = studied(
      {
        unitId: "os4",
        coverage: 0.9,
        prereqGap: 0.6,
        prereqBlockers: [{ conceptId: "paging", name: "Paging", mastery: 0.3, attempts: 8, unitId: "os3", unitName: "Memory Management" }],
      },
      { sequence: 0 },
    );
    const out = planToday({ ...base, units: [blocked] });
    expect(out.primary?.action).toBe("REVISE_CONCEPT");
    expect(out.primary?.conceptId).toBe("paging");
    expect(out.primary?.unitId).toBe("os3");
  });

  it("asks for a check quiz when coverage is reported but unproven", () => {
    const s = unit({ unitId: "dbms1", coverage: 1, marksShare: 0.8, plan: plan({ status: "ACTIVE", startedAt: daysAgo(5), sequence: 0 }) });
    const out = planToday({ ...base, units: [s] });
    expect(out.primary?.action).toBe("TAKE_MINI_TEST");
    expect(out.primary?.reasons[0]!.type).toBe("UNVERIFIED_COVERAGE");
  });

  it("skips snoozed units", () => {
    const snoozed = studied({ unitId: "x" }, { sequence: 0, snoozedUntil: new Date(NOW.getTime() + 86_400_000) });
    const other = unit({ unitId: "y", plan: plan({ sequence: 1 }) });
    expect(planToday({ ...base, units: [snoozed, other] }).primary?.unitId).toBe("y");
  });

  it("shows the student's own choice first and keeps the system pick as an alternative", () => {
    const a = studied({ unitId: "os", coverage: 0.9, mastery: 0.3 }, { sequence: 0 });
    const b = studied({ unitId: "dbms", coverage: 0.6, mastery: 0.7, practiceAccuracy: 0.7, recentAccuracy: 0.7, pyqAccuracy: 0.7, mistakes: 0 }, { sequence: 1 });
    const out = planToday({ ...base, units: [a, b], pinnedUnitId: "dbms" });
    expect(out.primary?.unitId).toBe("dbms");
    expect(out.alternatives.some((c) => c.unitId === "os")).toBe(true);
  });

  it("recommends revisiting a unit the student moved on from, after the cool-off", () => {
    const moved = studied(
      { unitId: "tc", coverage: 1, weakConcepts: [{ conceptId: "cfg", name: "CFG", mastery: 0.3, attempts: 7 }] },
      { status: "MOVED_ON", completedAt: daysAgo(5), unresolvedConceptIds: ["cfg"], sequence: 0, startedAt: daysAgo(6) },
    );
    const out = planToday({ ...base, units: [moved] });
    expect(out.primary?.action).toBe("REVISE_CONCEPT");
    expect(out.primary?.reasons[0]!.type).toBe("MOVED_ON_WEAKNESS");
  });

  it("holds the revisit back until the cool-off has passed", () => {
    const moved = studied({ unitId: "tc", coverage: 1 }, { status: "MOVED_ON", completedAt: daysAgo(1), unresolvedConceptIds: ["cfg"], sequence: 0, startedAt: daysAgo(2) });
    expect(planToday({ ...base, units: [moved] }).primary).toBeNull();
  });

  it("adds a mock in phase 4 once coverage is high enough", () => {
    const p4 = resolvePhase({ todayKey: "2027-01-25", prepStartKey: "2026-09-19", examKey: "2027-02-06" });
    const s = studied({ unitId: "z", coverage: 1, mastery: 0.85, practiceAccuracy: 0.85, recentAccuracy: 0.85, pyqAccuracy: 0.85, mistakes: 0 }, { status: "PROVISIONALLY_COMPLETE", sequence: 0 });
    const out = planToday({ ...base, now: new Date("2027-01-25T06:00:00Z"), phase: p4, units: [s], lastMockAt: new Date("2027-01-10T06:00:00Z") });
    expect(out.primary?.action).toBe("TAKE_MOCK");
  });

  it("only surfaces flashcards once the backlog is big enough", () => {
    const units = [unit({ unitId: "a", marksShare: 0, plan: plan({ sequence: 0 }) })];
    expect(planToday({ ...base, units, flashcardsDue: 2 }).alternatives.some((c) => c.action === "FLASHCARD_REVIEW")).toBe(false);
    expect(planToday({ ...base, units, flashcardsDue: 30 }).primary?.action).toBe("FLASHCARD_REVIEW");
  });

  it("breaks ties deterministically", () => {
    const units = [unit({ unitId: "b", plan: plan({ sequence: 1 }) }), unit({ unitId: "a", plan: plan({ sequence: 0 }) })];
    expect(planToday({ ...base, units }).primary?.unitId).toBe("a");
  });
});

describe("velocity", () => {
  it("classifies units by how long they took", () => {
    expect(classifyByDays(0.8)).toBe("EASY");
    expect(classifyByDays(1.3)).toBe("MEDIUM");
    expect(classifyByDays(3)).toBe("HARD");
  });

  it("learns per-subject pace but stays anchored to priors with little data", () => {
    const none = estimateVelocity([]);
    expect(estimateUnitDays({ subjectId: "os", difficultyClass: "MEDIUM" }, none)).toBeCloseTo(1, 5);
    const some = estimateVelocity([
      { subjectId: "os", difficultyClass: "MEDIUM", actualDays: 3 },
      { subjectId: "os", difficultyClass: "MEDIUM", actualDays: 3 },
    ]);
    const est = estimateUnitDays({ subjectId: "os", difficultyClass: "MEDIUM" }, some);
    expect(est).toBeGreaterThan(1);
    expect(est).toBeLessThan(3);
    expect(estimateUnitDays({ subjectId: "dbms", difficultyClass: "MEDIUM" }, some)).toBeGreaterThan(1);
  });
});

describe("pace", () => {
  const mk = (todayKey: string, coverage: number) => {
    const phase = resolvePhase({ todayKey, prepStartKey: "2026-09-19", examKey: "2027-02-06" });
    const units = Array.from({ length: 55 }, (_, i) => unit({ unitId: `u${i}`, coverage, plan: plan({ sequence: i }) }));
    return computePace({ todayKey, prepStartKey: "2026-09-19", examKey: "2027-02-06", phase, units, velocity: estimateVelocity([]) });
  };

  it("is on track at the start with time to spare", () => {
    expect(mk("2026-09-19", 0).status).toBe("ON_TRACK");
  });

  it("is behind when far too much is left near the coverage deadline", () => {
    const p = mk("2026-12-15", 0.2);
    expect(p.status).toBe("BEHIND");
    expect(p.slackDays as number).toBeLessThan(0);
  });

  it("reports no status without an exam date", () => {
    const phase = resolvePhase({ todayKey: "2026-09-19", prepStartKey: "2026-09-19", examKey: null });
    const p = computePace({ todayKey: "2026-09-19", prepStartKey: "2026-09-19", examKey: null, phase, units: [unit()], velocity: estimateVelocity([]) });
    expect(p.status).toBe("NO_EXAM_DATE");
  });
});

import { ladderUpdates } from "@/server/domains/planner/revision-ladder";
import { compareSnapshots, type SnapshotMetrics } from "@/server/domains/planner/weekly";

describe("revision ladder", () => {
  it("schedules the first revision one day after completion", () => {
    const done = studied({}, { status: "PROVISIONALLY_COMPLETE", completedAt: NOW });
    const [u] = ladderUpdates([done], NOW);
    expect(u!.patch.nextRevisionAt?.getTime()).toBe(NOW.getTime() + 86_400_000);
  });

  it("advances a rung when the student practised the unit after it fell due", () => {
    const done = studied(
      { lastPracticedAt: daysAgo(0.2) },
      { status: "PROVISIONALLY_COMPLETE", completedAt: daysAgo(8), nextRevisionAt: daysAgo(1), revisionCount: 1 },
    );
    const [u] = ladderUpdates([done], NOW);
    expect(u!.patch.revisionCount).toBe(2);
    // rung 2 = 7 days after the practice
    expect(Math.round(((u!.patch.nextRevisionAt as Date).getTime() - (done.lastPracticedAt as Date).getTime()) / 86_400_000)).toBe(7);
  });

  it("leaves an overdue rung alone when nothing was practised", () => {
    const done = studied({ lastPracticedAt: daysAgo(10) }, { status: "GOOD_ENOUGH", nextRevisionAt: daysAgo(2), revisionCount: 0 });
    expect(ladderUpdates([done], NOW)).toHaveLength(0);
  });

  it("ignores units still being learned", () => {
    expect(ladderUpdates([studied()], NOW)).toHaveLength(0);
  });
});

describe("weekly comparison", () => {
  const metrics = (mastery: number, cov: number): SnapshotMetrics => ({
    phase: 2, daysToExam: 100, coverage: cov, mastery, pyqAccuracy: 0.5, pyqAttempted: 20, revisionCoverage: 0.7,
    mocksCompleted: 0, paceStatus: "ON_TRACK", slackDays: 5, openMistakes: 3,
    units: [{ id: "a", coverage: cov, mastery }, { id: "b", coverage: cov, mastery: 0.8 }],
  });

  it("reports gains and slips per unit and states deltas in points", () => {
    const prev = { key: "2026-09-12", metrics: { ...metrics(0.4, 0.3), units: [{ id: "a", coverage: 0.3, mastery: 0.4 }, { id: "b", coverage: 0.3, mastery: 0.9 }] } };
    const r = compareSnapshots({ to: "2026-09-19", current: metrics(0.6, 0.4), previous: prev, names: { a: "OS 1", b: "OS 2" }, completedUnitNames: ["OS 1"], units: [] });
    expect(r.improvements[0]!.unitId).toBe("a");
    expect(r.regressions[0]!.unitId).toBe("b");
    expect(r.summary.some((l) => l.includes("Syllabus coverage moved +10.0 points"))).toBe(true);
  });

  it("copes with no previous snapshot", () => {
    const r = compareSnapshots({ to: "2026-09-19", current: metrics(0.6, 0.4), previous: null, names: {}, completedUnitNames: [], units: [] });
    expect(r.coverageDelta).toBeNull();
    expect(r.summary[0]).toContain("first weekly review");
  });
});

import { buildUnitSignals, computeMarksShare, type RawInput } from "@/server/domains/planner/signals";

describe("signals builder", () => {
  const raw = (over: Partial<RawInput> = {}): RawInput => ({
    units: [
      { id: "os1", name: "Processes", subjectId: "os", subjectName: "Operating Systems", concepts: [{ id: "paging", name: "Paging" }, { id: "vm", name: "Virtual memory" }] },
      { id: "os2", name: "Memory", subjectId: "os", subjectName: "Operating Systems", concepts: [{ id: "lru", name: "LRU" }, { id: "fifo", name: "FIFO" }] },
      { id: "db1", name: "ER model", subjectId: "db", subjectName: "Databases", concepts: [{ id: "er", name: "Entities" }] },
    ],
    stats: [],
    coverage: [],
    recent: [],
    openMistakesByUnit: {},
    deps: [],
    pyqMarksByUnit: {},
    planItems: [],
    ...over,
  });
  const stat = (conceptId: string, over = {}) => ({ conceptId, mastery: 0.5, retention: 0.6, completion: 1, attempts: 10, correct: 5, mistakes: 2, pyqAttempts: 4, pyqCorrect: 2, lastSeen: NOW, nextReviewAt: null, ...over });

  it("takes coverage from the larger of what the student reported and what the evidence shows", () => {
    const s = buildUnitSignals(raw({ coverage: [{ unitId: "os1", status: "LEARNING", pct: 0.5 }], stats: [stat("paging", { completion: 0.2 }), stat("vm", { completion: 0.2 })] }), NOW);
    expect(s[0]!.coverage).toBeCloseTo(0.5, 5);
    const done = buildUnitSignals(raw({ coverage: [{ unitId: "os1", status: "PROVISIONALLY_COMPLETE", pct: null }] }), NOW);
    expect(done[0]!.coverage).toBe(1);
  });

  it("leaves mastery and accuracy null when nothing has been attempted", () => {
    const s = buildUnitSignals(raw(), NOW)[0]!;
    expect(s.mastery).toBeNull();
    expect(s.practiceAccuracy).toBeNull();
    expect(s.plan.status).toBe("PENDING");
  });

  it("finds a shaky prerequisite in another unit and reports the gap", () => {
    const s = buildUnitSignals(
      raw({
        stats: [stat("paging", { mastery: 0.3 }), stat("lru", { mastery: 0.6 })],
        deps: [{ conceptId: "lru", prerequisiteId: "paging" }],
      }),
      NOW,
    );
    const os2 = s.find((u) => u.unitId === "os2")!;
    expect(os2.prereqGap).toBe(1);
    expect(os2.prereqBlockers[0]!.conceptId).toBe("paging");
    expect(os2.prereqBlockers[0]!.unitId).toBe("os1");
    expect(s.find((u) => u.unitId === "os1")!.prereqImportance).toBe(1);
  });

  it("counts overdue concepts for revision urgency", () => {
    const s = buildUnitSignals(raw({ stats: [stat("paging", { nextReviewAt: daysAgo(4) }), stat("vm", { nextReviewAt: new Date(NOW.getTime() + 86_400_000) })] }), NOW)[0]!;
    expect(s.dueConceptCount).toBe(1);
    expect(s.revisionDueShare).toBeCloseTo(0.5, 5);
    expect(s.avgOverdueDays).toBeCloseTo(4, 5);
  });

  it("uses subject weightings until the PYQ bank is large enough, then the bank itself", () => {
    const units = raw().units;
    const fallback = computeMarksShare(units, {});
    expect(Math.max(...Object.values(fallback))).toBe(1);
    const fromBank = computeMarksShare(units, { os1: 10, os2: 100, db1: 60 });
    expect(fromBank.os2).toBe(1);
    expect(fromBank.os1).toBeCloseTo(0.1, 5);
  });
});
