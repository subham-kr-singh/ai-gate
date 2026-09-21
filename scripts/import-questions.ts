/**
 * Usage:
 *   npm run import:questions -- ./path/to/questions.json
 *
 * Reads a JSON array of raw question objects (matching questionInputSchema
 * in server/domains/questions/question.schema.ts, using canonical
 * subjectId/unitId/topicId/conceptIds from the seeded syllabus — resolve
 * those first if your source file only has names), validates each with
 * Zod, and upserts by contentHash so re-running the same file is a no-op.
 *
 * A CSV variant is intentionally not included in V1 — convert CSV to this
 * JSON shape upstream (e.g. with a spreadsheet formula or a one-off
 * script) rather than adding a second parser path here.
 */
import { readFileSync } from "node:fs";
import { importQuestion } from "@/server/domains/questions/question.service";
import { db } from "@/server/db/client";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run import:questions -- <path-to-json>");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  if (!Array.isArray(raw)) {
    throw new Error("Import file must be a JSON array of question objects.");
  }

  let imported = 0;
  let failed = 0;

  for (const [i, item] of raw.entries()) {
    try {
      await importQuestion(item);
      imported += 1;
    } catch (err) {
      failed += 1;
      console.error(`Row ${i} failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Import complete. ${imported} upserted, ${failed} failed out of ${raw.length}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
