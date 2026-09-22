import { describe, it, expect } from "vitest";
import { phaseWindows, resolvePhase } from "@/server/domains/planner/phase.service";

/**
 * Regression guard for a real bug: with a runway shorter than the number of
 * phases, the old clamp (Math.max(o3 + 1, ...)) forced each phase start past
 * the previous one, pushing phase 4 *beyond the exam date* — the planner
 * showed a phase starting after the exam it counted down to.
 */
describe("phase windows", () => {
  it("never starts a phase on or after the exam date, at any runway length", () => {
    const prepStart = "2026-01-01";
    for (const span of [1, 2, 3, 4, 5, 6, 10, 30, 100, 400]) {
      const d = new Date(prepStart + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + span);
      const examKey = d.toISOString().slice(0, 10);
      const w = phaseWindows(prepStart, examKey);

      expect(w.length).toBe(4);
      for (const win of w) {
        // No phase may start after the exam, no window may run past it, and
        // none may be inverted. On a 1-2 day runway a phase start will equal
        // the exam date — unavoidable, and the UI degrades to zero-width
        // segments rather than showing a phase beyond the exam.
        expect(win.startKey <= examKey, `span=${span}: ${win.startKey} > exam ${examKey}`).toBe(true);
        expect(win.endKey <= examKey, `span=${span}: end ${win.endKey} > exam ${examKey}`).toBe(true);
        expect(win.startKey <= win.endKey, `span=${span}: inverted ${win.startKey}..${win.endKey}`).toBe(true);
      }
      for (let i = 1; i < 4; i++) {
        expect(w[i]!.startKey >= w[i - 1]!.startKey, `span=${span}: starts not sorted`).toBe(true);
      }
      expect(w[3]!.endKey).toBe(examKey);
    }
  });

  it("keeps all four phases inside the runway once there are enough days", () => {
    const prepStart = "2026-01-01";
    for (const span of [8, 20, 60, 200, 400]) {
      const d = new Date(prepStart + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + span);
      const examKey = d.toISOString().slice(0, 10);
      const w = phaseWindows(prepStart, examKey);
      for (const win of w) {
        expect(win.startKey < examKey, `span=${span}: ${win.startKey} >= exam`).toBe(true);
        expect(win.startKey < win.endKey, `span=${span}: zero-width ${win.startKey}`).toBe(true);
      }
    }
  });

  it("gives every phase a real span on a roomy runway", () => {
    const w = phaseWindows("2026-01-01", "2027-01-01");
    for (let i = 0; i < 4; i++) expect(w[i]!.startKey < w[i]!.endKey).toBe(true);
  });

  it("keeps four strictly increasing phases with a very short runway", () => {
    const w = phaseWindows("2026-09-19", "2026-09-25");
    for (let i = 1; i < 4; i++) expect(w[i]!.startKey > w[i - 1]!.startKey).toBe(true);
    expect(w[3]!.startKey < "2026-09-25").toBe(true);
  });

  it("resolves today on the exam date to phase 4 with no days left", () => {
    const r = resolvePhase({ todayKey: "2027-02-07", prepStartKey: "2026-09-22", examKey: "2027-02-07" });
    expect(r.phase).toBe(4);
    expect(r.daysToExam).toBe(0);
  });

  it("resolves today after the exam to phase 4", () => {
    const r = resolvePhase({ todayKey: "2027-03-01", prepStartKey: "2026-09-22", examKey: "2027-02-07" });
    expect(r.phase).toBe(4);
  });

  it("counts daysIntoPhase + daysLeftInPhase to the whole window", () => {
    const r = resolvePhase({ todayKey: "2026-10-01", prepStartKey: "2026-09-22", examKey: "2027-02-07" });
    const w = r.windows.find((x) => x.phase === r.phase)!;
    const a = new Date(w.startKey + "T00:00:00Z").getTime();
    const b = new Date(w.endKey + "T00:00:00Z").getTime();
    expect((r.daysIntoPhase ?? 0) + (r.daysLeftInPhase ?? 0)).toBe((b - a) / 86_400_000);
  });
});
