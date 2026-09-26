import { describe, expect, it } from "vitest";
import { generalAptitudeSubject } from "@/prisma/seed/general-aptitude.data";
import { syllabusSubjects } from "@/prisma/seed/syllabus.data";
import {
  CHAPTER_MAP,
  CONCEPT_ALIASES,
  GATEOVERFLOW_SOURCES,
  getSource,
} from "@/server/domains/gateoverflow/gateoverflow.config";
import { placeQuestion, type SyllabusIndex } from "@/server/domains/gateoverflow/gateoverflow.mapper";

/** Built from the real seed data, so the config tests fail if either drifts. */
const seedSubjects = [...syllabusSubjects, generalAptitudeSubject];
const seedCodes = new Set(seedSubjects.map((s) => s.code));
const seedUnitNames = new Map(
  seedSubjects.map((s) => [s.code, new Set(s.units.map((u) => u.name))])
);
const seedConceptNames = new Set(
  seedSubjects.flatMap((s) => s.units.flatMap((u) => u.topics.flatMap((t) => t.concepts.map((c) => c.name))))
);

/** Mirrors the shape prisma/seed writes: one Topic per Unit, concepts under it. */
const index: SyllabusIndex = {
  subjects: [
    {
      id: "s-math",
      code: "MATH",
      units: [
        {
          id: "u-linalg",
          name: "Linear Algebra",
          topicId: "t-linalg",
          topicName: "Linear Algebra",
          concepts: [
            { id: "c-matrices", name: "Matrices" },
            { id: "c-eigen", name: "Eigenvalues" },
          ],
        },
      ],
    },
    {
      id: "s-os",
      code: "OS",
      units: [
        {
          id: "u-pm1",
          name: "Process Management I",
          topicId: "t-pm1",
          topicName: "Process Management I",
          concepts: [{ id: "c-sched", name: "CPU scheduling" }],
        },
        {
          id: "u-mem",
          name: "Memory Management & Virtual Memory",
          topicId: "t-mem",
          topicName: "Memory Management & Virtual Memory",
          concepts: [{ id: "c-vmem", name: "Virtual memory" }],
        },
      ],
    },
  ],
};

describe("source config", () => {
  it("exposes an official and a structured source", () => {
    expect(GATEOVERFLOW_SOURCES["go-pdfs-html"]!.kind).toBe("html");
    expect(GATEOVERFLOW_SOURCES["go-pdfs-json"]!.kind).toBe("json");
  });

  it("throws a helpful error for an unknown source id", () => {
    expect(() => getSource("nope")).toThrow(/Unknown GATE Overflow source/);
  });

  it("maps every configured chapter to a seeded subject and unit", () => {
    for (const [chapter, mapping] of Object.entries(CHAPTER_MAP)) {
      expect(seedCodes, `chapter "${chapter}"`).toContain(mapping.subjectCode);
      expect(seedUnitNames.get(mapping.subjectCode), `chapter "${chapter}"`).toContain(mapping.unitName);
    }
  });

  it("points every concept alias at a seeded concept", () => {
    for (const [key, target] of Object.entries(CONCEPT_ALIASES)) {
      expect(seedConceptNames, `alias "${key}"`).toContain(target);
    }
  });

  it("keeps every alias key lowercase so lookups are case-insensitive", () => {
    for (const key of Object.keys(CONCEPT_ALIASES)) {
      expect(key).toBe(key.toLowerCase());
    }
  });
});

describe("placeQuestion", () => {
  it("places a question on the chapter's unit when there is no subtopic", () => {
    const result = placeQuestion(index, "Operating System", null);
    expect(result).toEqual({
      status: "placed",
      matchedConcept: false,
      placement: { subjectId: "s-os", unitId: "u-pm1", topicId: "t-pm1", conceptId: null },
    });
  });

  it("upgrades the placement to the concept's own unit when the subtopic maps", () => {
    const result = placeQuestion(index, "Operating System", "Virtual Memory");
    expect(result).toEqual({
      status: "placed",
      matchedConcept: true,
      placement: {
        subjectId: "s-os",
        unitId: "u-mem",
        topicId: "t-mem",
        conceptId: "c-vmem",
      },
    });
  });

  it("resolves an alias to the syllabus wording", () => {
    const result = placeQuestion(index, "Engineering Mathematics: Linear Algebra", "Eigen Value");
    expect(result).toEqual({
      status: "placed",
      matchedConcept: true,
      placement: {
        subjectId: "s-math",
        unitId: "u-linalg",
        topicId: "t-linalg",
        conceptId: "c-eigen",
      },
    });
  });

  it("does not match an unrelated subtopic", () => {
    const result = placeQuestion(index, "Operating System", "Compiler tokenization");
    expect(result).toEqual({
      status: "placed",
      matchedConcept: false,
      placement: { subjectId: "s-os", unitId: "u-pm1", topicId: "t-pm1", conceptId: null },
    });
  });

  it("reports a chapter the app has no subject for", () => {
    expect(placeQuestion(index, "Non GATE CSE: Java", null)).toEqual({ status: "skipped-chapter" });
    expect(placeQuestion(index, "Something Unknown", null)).toEqual({ status: "unmapped-chapter" });
  });

  it("uses a subject tag when the chapter is one of the book's catch-alls", () => {
    const result = placeQuestion(index, "Others: Others", null, ["operating-system"]);
    expect(result).toEqual({
      status: "placed",
      matchedConcept: false,
      placement: { subjectId: "s-os", unitId: "u-pm1", topicId: "t-pm1", conceptId: null },
    });
  });

  it("still reports a catch-all question with no subject tag as unmapped", () => {
    expect(placeQuestion(index, "Others: Others", null, ["ugcnetcse-dec2019-paper2"])).toEqual({
      status: "unmapped-chapter",
    });
    expect(placeQuestion(index, "Unknown Category", null, [])).toEqual({ status: "unmapped-chapter" });
  });

  it("treats non-GATE subjects as deliberately skipped, not unmapped", () => {
    expect(placeQuestion(index, "Artificial Intelligence", null)).toEqual({ status: "skipped-chapter" });
    expect(placeQuestion(index, "Data Mining and Warehousing", null)).toEqual({
      status: "skipped-chapter",
    });
  });

  it("is case- and whitespace-insensitive on the subtopic", () => {
    const result = placeQuestion(index, "Operating System", "  virtual   MEMORY  ");
    expect(result.status).toBe("placed");
    if (result.status === "placed") expect(result.placement.conceptId).toBe("c-vmem");
  });
});
