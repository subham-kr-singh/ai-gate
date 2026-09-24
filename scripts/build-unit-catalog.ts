/**
 * Writes the unit-wise GO-PDFs catalog to a committed file.
 *
 * Why a file and not a live query: building the catalog means downloading and
 * parsing every PDF of a release — 45 MB and ~60s for gatecse-2026. That is
 * fine on a laptop and impossible in a serverless request. So the structure is
 * computed here, on a machine that can afford it, and committed; the API then
 * serves it in milliseconds and only touches the DB for the staged counts.
 *
 * Run after a release changes:
 *   npx tsx --env-file=.env scripts/build-unit-catalog.ts
 *   npx tsx --env-file=.env scripts/build-unit-catalog.ts --release gatecse-2027
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db/client";
import { listReleaseUnits, listGopdfsReleases } from "@/server/domains/ingestion/gopdfs-import.service";
import type { UnitCatalogFile } from "@/server/domains/ingestion/catalog/types";

const OUT_DIR = path.resolve(process.cwd(), "server/domains/ingestion/catalog");
const OUT_FILE = path.join(OUT_DIR, "gopdfs-units.json");

function parseArgs(argv: string[]): { releases: string[] } {
  const idx = argv.indexOf("--release");
  if (idx !== -1 && argv[idx + 1]) return { releases: [argv[idx + 1]!] };
  const multi = argv.find((a) => a.startsWith("--releases="));
  if (multi) return { releases: multi.slice("--releases=".length).split(",") };
  return { releases: [] };
}

async function main() {
  const { releases } = parseArgs(process.argv.slice(2));
  const tags = releases.length > 0 ? releases : (await listGopdfsReleases()).map((r) => r.id);

  const ctx = { log: (m: string) => console.log(m), throttleMs: 1500, dryRun: true };
  const out: UnitCatalogFile = { generatedAt: new Date().toISOString(), releases: [] };

  for (const release of tags) {
    console.log(`\nBuilding catalog for ${release}…`);
    try {
      const catalog = await listReleaseUnits(release, ctx);
      out.releases.push({
        release,
        totals: {
          units: catalog.totals.units,
          blocks: catalog.totals.blocks,
          fullyTextual: catalog.totals.fullyTextual,
        },
        // `alreadyStaged` is dropped on purpose: it is a property of this
        // database at this moment, not of the release, so it is computed live
        // by the API rather than frozen into the file.
        units: catalog.units.map(({ alreadyStaged: _alreadyStaged, ...u }) => u),
      });
      console.log(`  ${catalog.totals.units} unit(s), ${catalog.totals.blocks} block(s)`);
    } catch (err) {
      // One unreachable release must not lose the rest of the catalog.
      console.error(`  skipped ${release}: ${(err as Error).message}`);
    }
  }

  if (out.releases.length === 0) throw new Error("No release produced a catalog; refusing to write an empty file.");

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${path.relative(process.cwd(), OUT_FILE)} (${out.releases.length} release(s)).`);

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
