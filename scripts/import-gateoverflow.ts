/**
 * Import GATE Overflow questions into the local question bank.
 *
 *   npm run import:gateoverflow                       # dry run, default source
 *   npm run import:gateoverflow -- --write            # actually write
 *   npm run import:gateoverflow -- --source go-pdfs-json --write
 *   npm run import:gateoverflow -- --force            # re-import unchanged bytes
 *
 * A dry run needs the syllabus seeded but writes nothing, so it is the safe
 * first step: it prints how many questions were found, how many are
 * importable, where they land per unit, and why the rest were skipped.
 */
import { DEFAULT_SOURCE_ID, GATEOVERFLOW_SOURCES } from "@/server/domains/gateoverflow/gateoverflow.config";
import { ingestGateOverflow } from "@/server/domains/gateoverflow/gateoverflow.service";
import { db } from "@/server/db/client";

function parseArgs(argv: string[]) {
  const flags = { write: false, force: false, sourceId: DEFAULT_SOURCE_ID as string };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") flags.write = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--source") flags.sourceId = argv[i + 1] ?? DEFAULT_SOURCE_ID;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run import:gateoverflow -- [--write] [--force] [--source <id>]");
      console.log("Sources:", Object.keys(GATEOVERFLOW_SOURCES).join(", "));
      process.exit(0);
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const dryRun = !flags.write;

  console.log(
    dryRun
      ? "Dry run — nothing will be written. Pass --write to import."
      : "Importing into the question bank."
  );

  const summary = await ingestGateOverflow({
    sourceId: flags.sourceId,
    dryRun,
    force: flags.force,
  });

  if (summary.status === "unchanged") {
    console.log("Upstream file is unchanged since the last completed import — nothing to do.");
    return;
  }

  console.log(`\nSource:  ${summary.sourceId}`);
  console.log(`URL:     ${summary.sourceUrl}`);
  console.log(`Parsed:  ${summary.questionCount} questions`);
  console.log(
    `Result:  ${summary.importedCount} ${dryRun ? "importable" : "created"}, ` +
      `${summary.updatedCount} updated, ${summary.skippedCount} skipped, ${summary.failedCount} failed`
  );

  const byUnit = Object.entries(summary.byUnit).sort((a, b) => b[1] - a[1]);
  if (byUnit.length > 0) {
    console.log("\nPer unit:");
    for (const [unitId, count] of byUnit) console.log(`  ${unitId}  ${count}`);
  }

  const reasons = Object.entries(summary.skipReasons).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  if (reasons.length > 0) {
    console.log("\nSkipped because:");
    for (const [reason, count] of reasons) console.log(`  ${reason}  ${count}`);
  }

  if (summary.errors.length > 0) {
    console.log("\nFirst errors:");
    for (const error of summary.errors) console.log(`  ${error}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
