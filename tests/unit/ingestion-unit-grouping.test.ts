import { describe, expect, it } from "vitest";
import { groupIntoUnits, type SegmentedVolume, type QuestionBlock } from "@/server/domains/ingestion/segmenter";
import { resolveUnitIds } from "@/server/domains/ingestion/gopdfs-import.service";

/**
 * Unit grouping is what makes a GO import addressable section by section, so
 * these tests pin the two things that go wrong quietly: a section that never
 * appeared as a heading being dropped, and section ids colliding across the
 * volumes of one release.
 */

function block(over: Partial<QuestionBlock> & { id: string; section: string }): QuestionBlock {
  const [chapter] = over.id.split(".");
  return {
    chapter: Number(chapter),
    chapterTitle: null,
    sectionTitle: null,
    topicTitle: null,
    examLabel: "GATE CSE 2020",
    year: 2020,
    questionRef: null,
    statement: "q",
    options: [],
    tags: [],
    rawBlockText: "q",
    hasImageContent: false,
    imageLineCount: 0,
    startPage: 1,
    endPage: 1,
    lineIndex: 0,
    ...over,
  };
}

function volume(blocks: QuestionBlock[], topics: SegmentedVolume["chapters"][number]["topics"] = []): SegmentedVolume {
  return {
    chapters: [
      { number: Number(blocks[0]?.id.split(".")[0] ?? 1), title: "Chapter", expectedCount: null, page: null, topics },
    ],
    blocks,
    answers: new Map(),
    bodyStartPage: 1,
  };
}

describe("groupIntoUnits", () => {
  it("buckets blocks by printed section and keeps TOC titles", () => {
    const seg = volume(
      [
        block({ id: "1.1.1", section: "1.1" }),
        block({ id: "1.1.2", section: "1.1" }),
        block({ id: "1.2.1", section: "1.2" }),
      ],
      [
        { section: "1.1", title: "Balls In Bins", expectedCount: 2, page: 1 },
        { section: "1.2", title: "Combinatory", expectedCount: 1, page: 5 },
      ]
    );

    const units = groupIntoUnits(seg);
    expect(units.map((u) => u.section)).toEqual(["1.1", "1.2"]);
    expect(units.map((u) => u.label)).toEqual(["Balls In Bins", "Combinatory"]);
    expect(units.map((u) => u.blocks.length)).toEqual([2, 1]);
    expect(units[0]!.expectedCount).toBe(2);
  });

  it("keeps a section that has no TOC row instead of dropping its questions", () => {
    const seg = volume([block({ id: "1.9.1", section: "1.9", sectionTitle: "Unscheduled" })]);

    const units = groupIntoUnits(seg);
    expect(units).toHaveLength(1);
    expect(units[0]!.section).toBe("1.9");
    expect(units[0]!.label).toBe("Unscheduled");
    expect(units[0]!.blocks).toHaveLength(1);
  });

  it("counts fully-textual blocks separately from ones carrying rasterised math", () => {
    const seg = volume([
      block({ id: "1.1.1", section: "1.1" }),
      block({ id: "1.1.2", section: "1.1", hasImageContent: true, imageLineCount: 3 }),
      block({ id: "1.1.3", section: "1.1" }),
    ]);

    const [unit] = groupIntoUnits(seg);
    expect(unit!.blocks).toHaveLength(3);
    expect(unit!.fullyTextual).toBe(2);
    expect(unit!.withImages).toBe(1);
  });

  it("uses the bare section as the id when no volume key is given", () => {
    const seg = volume([block({ id: "2.2.1", section: "2.2" })]);
    expect(groupIntoUnits(seg)[0]!.id).toBe("2.2");
  });

  it("prefixes the id with the volume key when one is given", () => {
    const seg = volume([block({ id: "2.2.1", section: "2.2" })]);
    const [unit] = groupIntoUnits(seg, { volumeKey: "volume1" });
    expect(unit!.id).toBe("volume1:2.2");
    // `section` stays bare so a caller can still display the printed number.
    expect(unit!.section).toBe("2.2");
  });

  it("gives the same printed section distinct ids in different volumes", () => {
    // The real case: volume 1 chapter 2 is Graph Theory, volume 2 chapter 2 is
    // CO & Architecture, and both print a "2.2". Without the prefix their
    // drafts would be indistinguishable in the review queue.
    const v1 = groupIntoUnits(volume([block({ id: "2.2.1", section: "2.2" })]), { volumeKey: "volume1" });
    const v2 = groupIntoUnits(volume([block({ id: "2.2.1", section: "2.2" })]), { volumeKey: "volume2" });

    expect(v1[0]!.id).not.toBe(v2[0]!.id);
    expect(new Set([v1[0]!.id, v2[0]!.id])).toEqual(new Set(["volume1:2.2", "volume2:2.2"]));
  });

  it("sorts units numerically, so 1.10 follows 1.9 rather than 1.1", () => {
    const seg = volume([
      block({ id: "1.10.1", section: "1.10" }),
      block({ id: "1.9.1", section: "1.9" }),
      block({ id: "1.1.1", section: "1.1" }),
    ]);

    const ids = groupIntoUnits(seg).map((u) => u.section);
    expect(ids).toEqual(["1.1", "1.9", "1.10"]);
  });

  it("collects the exam labels seen in a unit", () => {
    const seg = volume([
      block({ id: "1.1.1", section: "1.1", examLabel: "GATE CSE 2018" }),
      block({ id: "1.1.2", section: "1.1", examLabel: "GATE CSE 2020" }),
      block({ id: "1.1.3", section: "1.1", examLabel: "GATE CSE 2018" }),
    ]);

    const [unit] = groupIntoUnits(seg);
    expect(unit!.exams.sort()).toEqual(["GATE CSE 2018", "GATE CSE 2020"]);
  });
});

describe("resolveUnitIds", () => {
  const multi = [
    { id: "volume1:2.2", section: "2.2" },
    { id: "volume2:2.2", section: "2.2" },
    { id: "volume1:1.1", section: "1.1" },
  ];

  it("accepts an exact catalog id", () => {
    expect([...resolveUnitIds(["volume1:2.2"], multi, "gatecse-2026")]).toEqual(["volume1:2.2"]);
  });

  it("expands an unambiguous bare section number", () => {
    expect([...resolveUnitIds(["1.1"], multi, "gatecse-2026")]).toEqual(["volume1:1.1"]);
  });

  it("refuses a bare section that exists in more than one volume, naming the options", () => {
    let message = "";
    try {
      resolveUnitIds(["2.2"], multi, "gatecse-2026");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("volume1:2.2");
    expect(message).toContain("volume2:2.2");
    // Importing one volume's questions under the other's unit is the failure
    // this guards, so it must not silently pick a winner.
    expect(message).toContain("use the full id");
  });

  it("refuses an id that is in no volume", () => {
    expect(() => resolveUnitIds(["99.9"], multi, "gatecse-2026")).toThrow(/Unknown unit id "99\.9"/);
  });

  it("resolves several ids at once, mixing exact and shorthand", () => {
    expect([...resolveUnitIds(["volume2:2.2", "1.1"], multi, "gatecse-2026")].sort()).toEqual([
      "volume1:1.1",
      "volume2:2.2",
    ]);
  });
});
