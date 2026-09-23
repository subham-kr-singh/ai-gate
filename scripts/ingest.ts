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
 */
import { resolveAdapters, allAdapters } from "@/server/domains/ingestion/sources/registry";
import { runIngestion, type RunTotals } from "@/server/domains/ingestion/runner";
import { db } from "@/server/db/client";
import type { IngestContext } from "@/server/domains/ingestion/sources/types";

interface Args {
  sources: string | undefined;
  unit: string | undefined;
  list: boolean;
  dryRun: boolean;
  publishableOnly: boolean;
  limit: number | null;
  throttleMs: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const limitRaw = get("--limit");
  const throttleRaw = get("--throttle-ms");
  return {
    sources: get("--source"),
    unit: get("--unit"),
    list: argv.includes("--list"),
    dryRun: argv.includes("--dry-run"),
    publishableOnly: argv.includes("--publishable-only"),
    limit: limitRaw ? Number(limitRaw) : null,
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
