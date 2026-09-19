import { describe, it, expect } from "vitest";
import { SYLLABUS_SUBJECTS } from "@/prisma/seed/syllabus.data";
import { GENERAL_APTITUDE_SUBJECT } from "@/prisma/seed/general-aptitude.data";

describe("syllabus seed data", () => {
  it("contains exactly 55 units across all subjects (per architecture doc)", () => {
    const unitCount = SYLLABUS_SUBJECTS.reduce(
      (sum, s) => sum + s.units.length,
      0,
    );
    expect(unitCount).toBe(55);
  });

  it("has unique subject codes", () => {
    const codes = SYLLABUS_SUBJECTS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has unique unit codes within each subject", () => {
    for (const subject of SYLLABUS_SUBJECTS) {
      const codes = subject.units.map((u) => u.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("every unit has at least one concept", () => {
    for (const subject of SYLLABUS_SUBJECTS) {
      for (const unit of subject.units) {
        expect(unit.concepts.length).toBeGreaterThan(0);
      }
    }
  });

  it("General Aptitude is defined separately from the 55-unit core", () => {
    expect(GENERAL_APTITUDE_SUBJECT.code).toBe("GA");
    expect(GENERAL_APTITUDE_SUBJECT.units.length).toBeGreaterThan(0);
  });
});
