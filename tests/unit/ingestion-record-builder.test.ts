import { describe, expect, it } from "vitest";
import { parseMultiSelectAnswer, parseNatAnswer } from "@/server/domains/ingestion/record-builder";

describe("parseNatAnswer", () => {
  it("parses an exact integer", () => {
    expect(parseNatAnswer("7")).toEqual({ value: "7" });
  });

  it("parses a negative and a decimal value", () => {
    expect(parseNatAnswer("-3")).toEqual({ value: "-3" });
    expect(parseNatAnswer("0.99")).toEqual({ value: "0.99" });
  });

  it("treats an equal-value pair as exact, not as a band", () => {
    expect(parseNatAnswer("65 : 65")).toEqual({ value: "65" });
  });

  it("converts a two-sided range into value plus tolerance", () => {
    expect(parseNatAnswer("197.9 : 198.1")).toEqual({ value: "198", min: 197.9, max: 198.1 });
  });

  it("orders the band regardless of how the range was printed", () => {
    expect(parseNatAnswer("198.1 : 197.9")).toEqual({ value: "198", min: 197.9, max: 198.1 });
  });

  it("parses the bracketed tolerance form", () => {
    expect(parseNatAnswer("5 [4,6]")).toEqual({ value: "5", min: 4, max: 6 });
  });

  it("parses a band written as prose", () => {
    expect(parseNatAnswer("4.24 to 4.26")).toEqual({ value: "4.25", min: 4.24, max: 4.26 });
  });

  it("treats a worded equal pair as exact", () => {
    expect(parseNatAnswer("7 to 7")).toEqual({ value: "7" });
  });

  it("rejects two bare numbers with no separator as ambiguous", () => {
    expect(parseNatAnswer("4.24 4.26")).toBeNull();
  });

  it("returns null for non-numeric answers and N/A", () => {
    expect(parseNatAnswer("B")).toBeNull();
    expect(parseNatAnswer("N/A")).toBeNull();
    expect(parseNatAnswer("")).toBeNull();
  });

  it("does not mis-read a multi-select letter list as a number", () => {
    expect(parseNatAnswer("A;C")).toBeNull();
  });
});

describe("parseMultiSelectAnswer", () => {
  it("splits the separators GO uses", () => {
    expect(parseMultiSelectAnswer("A;C")).toEqual(["A", "C"]);
    expect(parseMultiSelectAnswer("A, C")).toEqual(["A", "C"]);
    expect(parseMultiSelectAnswer("A ; B ; C")).toEqual(["A", "B", "C"]);
  });

  it("normalises case and drops non-option tokens", () => {
    expect(parseMultiSelectAnswer("a c")).toEqual(["A", "C"]);
    expect(parseMultiSelectAnswer("A;X")).toEqual(["A"]);
  });

  it("returns an empty array when nothing valid is present", () => {
    expect(parseMultiSelectAnswer("none")).toEqual([]);
  });
});
