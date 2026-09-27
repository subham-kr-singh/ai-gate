/**
 * Import GATE Overflow questions into the local question bank.
 *
 *   npm run import:gateoverflow                       # dry run, all auto sources
 *   npm run import:gateoverflow -- --write            # actually write
 *   npm run import:gateoverflow -- --source go-pdfs-html --write
 *   npm run import:gateoverflow -- --force            # re-import unchanged bytes
 *
 * A dry run needs the syllabus seeded but writes nothing, so it is the safe
 * first step: it prints how many questions were found, how many are
 * importable, where they land per unit, and why the rest were skipped.
 *
 * With no `--source` every auto source is imported, because the corpora are
 * disjoint (the GATE CSE JSON mirror and the UGC-NET CS book share no GO post
 * ids) and pulling only one leaves the other's material missing.
 */
import {
  AUTO_SOURCE_IDS,
  DEFAULT_SOURCE_ID,
  GATEOVERFLOW_SOURCES,
} from "@/server/domains/gateoverflow/gateoverflow.config";
import {
  ingestAllGateOverflowSources,
  ingestGateOverflow,
  type IngestSummary,
} from "@/server/domains/gateoverflow/gateoverflow.service";
import { db } from "@/server/db/client";

function parseArgs(argv: string[]) {
  const flags = { write: false, force: false, sourceId: null as string | null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") flags.write = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--source") flags.sourceId = argv[i + 1] ?? DEFAULT_SOURCE_ID;
    else if (arg === "--all") flags.sourceId = null;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run import:gateoverflow -- [--write] [--force] [--source <id> | --all]");
      console.log("Sources:", Object.keys(GATEOVERFLOW_SOURCES).join(", "));
      console.log("Auto (imported when --source is omitted):", AUTO_SOURCE_IDS.join(", "));
      process.exit(0);
    }
  }
  return flags;
}

function report(summary: IngestSummary, dryRun: boolean) {
  if (summary.status === "unchanged") {
    console.log(`\n${summary.sourceId}: upstream unchanged since the last completed import — nothing to do.`);
    return;
  }

  console.log(`\nSource:  ${summary.sourceId}`);
  console.log(`URL:     ${summary.sourceUrl}`);
  console.log(`Parsed:  ${summary.questionCount} questions`);
  console.log(
    `Result:  ${summary.importedCount} ${dryRun ? "importable" : "created"}, ` +
      `${summary.updatedCount} updated, ${summary.skippedCount} skipped, ${summary.failedCount} failed`
  );

  const reasons = Object.entries(summary.skipReasons).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  if (reasons.length > 0) {
    console.log("Skipped because:");
    for (const [reason, count] of reasons) console.log(`  ${reason}  ${count}`);
  }

  if (summary.errors.length > 0) {
    console.log("First errors:");
    for (const error of summary.errors) console.log(`  ${error}`);
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const dryRun = !flags.write;

  console.log(
    dryRun
      ? "Dry run — nothing will be written. Pass --write to import."
      : "Importing into the question bank."
  );

  if (flags.sourceId) {
    report(await ingestGateOverflow({ sourceId: flags.sourceId, dryRun, force: flags.force }), dryRun);
    return;
  }

  const all = await ingestAllGateOverflowSources({ dryRun, force: flags.force });
  for (const summary of all.sources) report(summary, dryRun);

  if (all.staleRunsClosed > 0) {
    console.log(`\nClosed ${all.staleRunsClosed} stale "running" run(s) from an interrupted process.`);
  }

  console.log(
    `\nTotal across ${all.sources.length} source(s): ` +
      `${all.totalImported} ${dryRun ? "importable" : "created"}, ` +
      `${all.totalUpdated} updated, ${all.totalSkipped} skipped.`
  );

  if (all.failed.length > 0) {
    console.error("\nSources that failed:");
    for (const f of all.failed) console.error(`  ${f.sourceId}: ${f.error}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
