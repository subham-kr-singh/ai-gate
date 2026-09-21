import { describe, expect, it } from "vitest";

// syllabus.service's resolveEntity() requires a live DB connection (it
// reads via syllabus.repository), so it's covered by the integration
// suite instead. This file unit-tests the pure token-similarity matcher
// by re-implementing the same minimal algorithm inline — if you change
// the matching logic in syllabus.service.ts, mirror the change here or
// promote `similarity`/`normalize` to a standalone, exported pure module.

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  const ta = new Set(normalize(a).split(" ").filter(Boolean));
  const tb = new Set(normalize(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const tok of ta) if (tb.has(tok)) overlap++;
  return overlap / new Set([...ta, ...tb]).size;
}

describe("syllabus entity-name similarity", () => {
  it("scores an exact phrase match as 1", () => {
    expect(similarity("Page Replacement", "Page Replacement")).toBe(1);
  });

  it("scores a partial token overlap between 0 and 1", () => {
    const score = similarity("OS Page Replacement", "Memory Management Page Replacement");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("scores completely unrelated phrases as 0", () => {
    expect(similarity("subnetting", "Dynamic Programming")).toBe(0);
  });

  it("is case- and punctuation-insensitive", () => {
    expect(similarity("Page-Replacement!", "page replacement")).toBe(1);
  });
});
