/**
 * The shape of the committed GO-PDFs unit catalog.
 *
 * Kept beside the file it describes rather than in the script that writes it,
 * so the API route can import the type without reaching into `scripts/`.
 */
import type { ReleaseUnitCatalog } from "@/server/domains/ingestion/gopdfs-import.service";

/** A catalog unit as it is frozen into the file. `alreadyStaged` is excluded
 * because it describes a database at one moment, not the release; the API
 * computes it live. */
export type CatalogUnit = Omit<ReleaseUnitCatalog["units"][number], "alreadyStaged">;

export interface UnitCatalogFile {
  /** When the file was generated, so a caller can judge how fresh it is. */
  generatedAt: string;
  releases: {
    release: string;
    totals: Pick<ReleaseUnitCatalog["totals"], "units" | "blocks" | "fullyTextual">;
    units: CatalogUnit[];
  }[];
}
