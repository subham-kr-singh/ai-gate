import { describe, expect, it } from "vitest";
import { parseCatalogLabel } from "@/server/domains/ingestion/concept-mapper";

/**
 * The assisted classifier returns one entry copied from the candidate catalog.
 * This parser is the trust boundary for that text: whatever the model writes
 * has to become a clean (subject code, name) pair, or resolve to nothing.
 */
describe("parseCatalogLabel", () => {
  it("splits a well-formed catalog entry", () => {
    expect(parseCatalogLabel("OS:Process Synchronization")).toEqual({
      code: "OS",
      name: "Process Synchronization",
    });
  });

  it("normalises a lowercase or padded subject code", () => {
    expect(parseCatalogLabel("  dbms :  Normalization ")).toEqual({
      code: "DBMS",
      name: "Normalization",
    });
  });

  it("splits on the first colon only, so names may contain their own", () => {
    expect(parseCatalogLabel("OS:File Systems: allocation")).toEqual({
      code: "OS",
      name: "File Systems: allocation",
    });
  });

  it("rejects a bare unit name with no subject prefix", () => {
    // Accepting this would mean guessing a subject, which is the wrong-topic
    // filing the mapper is designed to avoid.
    expect(parseCatalogLabel("Process Synchronization")).toBeNull();
  });

  it("rejects empty, missing, or malformed picks", () => {
    expect(parseCatalogLabel(null)).toBeNull();
    expect(parseCatalogLabel(undefined)).toBeNull();
    expect(parseCatalogLabel("")).toBeNull();
    expect(parseCatalogLabel(":no subject")).toBeNull();
    expect(parseCatalogLabel("OS:")).toBeNull();
    expect(parseCatalogLabel("OS:   ")).toBeNull();
  });
});
