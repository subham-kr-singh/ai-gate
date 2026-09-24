/**
 * Multi-source ingestion CLI (architecture §54, §101).
 *
 * Pipeline: Source -> Fetch -> Parse -> Extract -> Classify -> Deduplicate
 * -> Validate -> Stage -> (human) Publish.
 *
 * Every stage up to and including Stage runs here, writing one
 * `IngestedQuestionDraft` per extracted question. It never writes to
 * `Question`: promotion happens only through `scripts/review-drafts.ts`,
 * which a human runs deliberately. See docs/ingestion-pipeline-report.md for
 * why that gate is load-bearing (rasterised math, incomplete answer keys).
 *
 * Usage:
 *   npx tsx scripts/ingest.ts --list
 *   npx tsx scripts/ingest.ts --source gopdfs --unit gatecse-2026
 *   npx tsx scripts/ingest.ts --source gopdfs --unit gatecse-2026 --publishable-only
 *   npx tsx scripts/ingest.ts --source gopdfs --unit gatecse-2026 --dry-run
 *   npx tsx scripts/ingest.ts --source examside --unit dbms --limit 25
 *
 * Unit-wise GO-PDFs import (release -> section, architecture §101–103):
 *   npx tsx scripts/ingest.ts --source gopdfs --list-units --release gatecse-2026
 *   npx tsx scripts/ingest.ts --source gopdfs --release gatecse-2026 --unit 1.1
 *   npx tsx scripts/ingest.ts --source gopdfs --release gatecse-2026 --unit 1.1 --unit 2.2
 *   npx tsx scripts/ingest.ts --source gopdfs --release gatecse-2026 --limit-per-unit 20
 */
import { resolveAdapters, allAdapters } from "@/server/domains/ingestion/sources/registry";
import {
  importReleaseUnits,
  listReleaseUnits,
} from "@/server/domains/ingestion/gopdfs-import.service";
import { runIngestion, type RunTotals } from "@/server/domains/ingestion/runner";
import { db } from "@/server/db/client";
import type { IngestContext } from "@/server/domains/ingestion/sources/types";

interface Args {
  sources: string | undefined;
  unit: string | undefined;
  /** Every `--unit` given; the unit-wise GO-PDFs import accepts several. */
  units: string[];
  release: string | undefined;
  list: boolean;
  listUnits: boolean;
  dryRun: boolean;
  publishableOnly: boolean;
  limit: number | null;
  limitPerUnit: number | null;
  throttleMs: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const limitRaw = get("--limit");
  const perUnitRaw = get("--limit-per-unit");
  const throttleRaw = get("--throttle-ms");
  const units: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--unit" && argv[i + 1]) units.push(argv[i + 1]!);
  }
  return {
    sources: get("--source"),
    unit: get("--unit"),
    units,
    release: get("--release"),
    list: argv.includes("--list"),
    listUnits: argv.includes("--list-units"),
    dryRun: argv.includes("--dry-run"),
    publishableOnly: argv.includes("--publishable-only"),
    limit: limitRaw ? Number(limitRaw) : null,
    limitPerUnit: perUnitRaw ? Number(perUnitRaw) : null,
    throttleMs: throttleRaw ? Number(throttleRaw) : 1500,
  };
}

function printTotals(label: string, t: RunTotals): void {
  console.log(
    `      ${label.padEnd(24)} extracted ${String(t.extracted).padStart(5)} | mapped ${String(
      t.mapped
    ).padStart(5)} | publishable ${String(t.publishable).padStart(4)} | yield ${t.yieldPercent}%`
  );
  if (t.alreadyKnown) console.log(`      ${" ".repeat(24)} already known: ${t.alreadyKnown}`);
  if (t.corroborated) console.log(`      ${" ".repeat(24)} corroborated by another source: ${t.corroborated}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ctx: IngestContext = {
    log: (m) => console.log(m),
    limit: args.limit ?? undefined,
    throttleMs: args.throttleMs,
    dryRun: args.dryRun,
  };

  if (args.list) {
    console.log("Registered sources:");
    for (const a of allAdapters()) {
      console.log(`  ${a.id.padEnd(12)} ${a.reliability.padEnd(10)} ${a.label}`);
      const units = await a.listUnits(ctx);
      for (const u of units) console.log(`      - ${u.id}  ${u.label}`);
    }
    await db.$disconnect();
    return;
  }

  // Unit-wise GO-PDFs import. Handled here rather than inside the adapter
  // because it walks *within* a release (section by section) and needs a
  // resume/report grain the generic `runIngestion` loop does not model.
  if (args.sources === "gopdfs" && (args.listUnits || args.release)) {
    if (!args.release) {
      throw new Error("--release <tag> is required for a unit-wise import. Run --source gopdfs --list to see tags.");
    }

    if (args.listUnits) {
      console.log(`Unit-wise catalog for gopdfs/${args.release}:`);
      const catalog = await listReleaseUnits(args.release, ctx);
      let lastChapter: number | null = null;
      for (const u of catalog.units) {
        if (u.chapter !== lastChapter) {
          console.log(`  Chapter ${u.chapter}: ${u.chapterTitle ?? "(untitled)"}  [${u.volume}]`);
          lastChapter = u.chapter;
        }
        console.log(
          `      - ${u.id.padEnd(6)} ${String(u.blockCount).padStart(4)} block(s), ` +
            `${String(u.fullyTextual).padStart(4)} fully textual, ` +
            `expected ${u.expectedCount ?? "-"}, staged ${u.alreadyStaged}  ${u.label}`
        );
      }
      console.log(
        `\n  ${catalog.totals.units} unit(s), ${catalog.totals.blocks} block(s), ` +
          `${catalog.totals.fullyTextual} fully textual, ${catalog.totals.alreadyStaged} already staged.`
      );
      await db.$disconnect();
      return;
    }

    const results = await importReleaseUnits({
      release: args.release,
      unitIds: args.units,
      limitPerUnit: args.limitPerUnit ?? args.limit ?? undefined,
      persist: !args.dryRun,
      publishableOnly: args.publishableOnly,
      ctx,
    });

    console.log("\nUnit-wise import:");
    for (const r of results) {
      console.log(
        `      ${r.unitId.padEnd(6)} ${r.unitLabel.slice(0, 34).padEnd(34)} ` +
          `extracted ${String(r.totals.extracted).padStart(4)} | mapped ${String(r.totals.mapped).padStart(4)} | ` +
          `publishable ${String(r.totals.publishable).padStart(4)} | staged ${String(r.staged).padStart(4)}`
      );
    }
    const grand = results.reduce(
      (acc, r) => ({
        extracted: acc.extracted + r.totals.extracted,
        mapped: acc.mapped + r.totals.mapped,
        publishable: acc.publishable + r.totals.publishable,
        staged: acc.staged + r.staged,
      }),
      { extracted: 0, mapped: 0, publishable: 0, staged: 0 }
    );
    console.log(
      `      ${"".padEnd(6)} ${"TOTAL".padEnd(34)} extracted ${String(grand.extracted).padStart(4)} | ` +
        `mapped ${String(grand.mapped).padStart(4)} | publishable ${String(grand.publishable).padStart(4)} | ` +
        `staged ${String(grand.staged).padStart(4)}`
    );
    if (args.dryRun) console.log("      (dry run — nothing written)");
    await db.$disconnect();
    return;
  }

  const adapters = resolveAdapters(args.sources);
  const summary = await runIngestion(adapters, {
    ctx,
    persist: !args.dryRun,
    publishableOnly: args.publishableOnly,
    limit: args.limit ?? undefined,
    unitFilter: args.unit ? (_id, u) => u.id === args.unit : undefined,
  });

  console.log("\nValidation summary (records failing each check):");
  for (const [k, v] of [...summary.grand.andErrorsByKind.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(v).padStart(5)}  ${k}`);
  }

  console.log("\nPer unit:");
  for (const row of summary.perUnit) printTotals(`${row.adapter}/${row.unit}`, row.totals);
  console.log("\nGrand total:");
  printTotals("all sources", summary.grand);
  if (args.dryRun) console.log("      (dry run — nothing written)");

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
