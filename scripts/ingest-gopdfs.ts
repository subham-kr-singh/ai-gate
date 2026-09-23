/**
 * GO-PDFs ingestion CLI (architecture §54 Content Ingestion Pipeline).
 *
 * Pipeline: Source -> Fetcher -> Raw Artifact -> Hash -> Parser -> Normalizer
 * -> Metadata Extractor -> Question Extractor -> Concept Classifier ->
 * Deduplicator -> Validator -> Review -> Publish.
 *
 * This script runs every stage up to and including Validate, writing one
 * `IngestedQuestionDraft` per extracted question. It never writes to
 * `Question`: promotion happens only through `scripts/review-drafts.ts`, which
 * a human runs deliberately. See docs/ingestion-pipeline-report.md for the
 * current extraction-fidelity limits that make that review gate load-bearing.
 *
 * Usage:
 *   npx tsx scripts/ingest-gopdfs.ts --release gatecse-2026
 *   npx tsx scripts/ingest-gopdfs.ts --release gatecse-2026 --publishable-only
 *   npx tsx scripts/ingest-gopdfs.ts --release gatecse-2026 --dry-run
 */
import { parsePdf } from "@/server/domains/ingestion/pdf-parser";
import { segmentVolume, type QuestionBlock } from "@/server/domains/ingestion/segmenter";
import { createConceptMapper } from "@/server/domains/ingestion/concept-mapper";
import { buildRecord } from "@/server/domains/ingestion/record-builder";
import { fetchReleaseAssets } from "@/server/domains/ingestion/fetcher";
import { db } from "@/server/db/client";
import { findActiveSyllabusVersion } from "@/server/domains/syllabus/syllabus.repository";

interface Args {
  release: string;
  dryRun: boolean;
  publishableOnly: boolean;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const release = get("--release");
  if (!release) throw new Error("--release <tag> is required (e.g. --release gatecse-2026)");
  const limitRaw = get("--limit");
  return {
    release,
    dryRun: argv.includes("--dry-run"),
    publishableOnly: argv.includes("--publishable-only"),
    limit: limitRaw ? Number(limitRaw) : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const version = await findActiveSyllabusVersion();
  if (!version) throw new Error("No active SyllabusVersion — run `npm run seed` first.");
  const mapBlock = createConceptMapper(version.id);

  console.log(`[1/6] Fetching release "${args.release}" ...`);
  const assets = await fetchReleaseAssets(args.release);
  console.log(`      ${assets.length} PDF(s): ${assets.map((a) => a.name).join(", ")}`);

  const totals = {
    blocks: 0,
    withAnswer: 0,
    mapped: 0,
    publishable: 0,
    alreadyKnown: 0,
    staged: 0,
    duplicates: 0,
  };
  const errorTally = new Map<string, number>();
  const perSubject = new Map<string, number>();

  for (const asset of assets) {
    console.log(`\n[2/6] Parsing ${asset.name} ...`);
    const parsed = await parsePdf(asset.filePath);

    console.log(`[3/6] Segmenting ${asset.name} ...`);
    const seg = segmentVolume(parsed);
    console.log(
      `      ${seg.blocks.length} question block(s), ${seg.answers.size} answer-key entr(ies), ${seg.chapters.length} chapter(s)`
    );
    totals.blocks += seg.blocks.length;

    const blocks = args.limit ? seg.blocks.slice(0, args.limit) : seg.blocks;
    let index = 0;

    for (const block of blocks) {
      index++;
      const answer = seg.answers.get(block.id);
      if (answer) totals.withAnswer++;

      const mapping = await mapBlock(block);
      if (mapping) {
        totals.mapped++;
        const key = mapping.subjectId;
        perSubject.set(key, (perSubject.get(key) ?? 0) + 1);
      }

      const record = buildRecord({
        block,
        answer,
        mapping,
        releaseTag: args.release,
        pdfUrl: asset.url,
      });

      for (const err of record.errors) {
        const key = err.split(":")[0] ?? err;
        errorTally.set(key, (errorTally.get(key) ?? 0) + 1);
      }

      if (!record.publishable) continue;
      totals.publishable++;

      if (args.dryRun) continue;

      // Deduplicator: contentHash is unique in the books, so a re-run or a
      // question that appears in two volumes is skipped rather than duplicated.
      const existingQuestion = await db.question.findUnique({ where: { contentHash: record.contentHash } });
      const existingDraft = await db.ingestedQuestionDraft.findUnique({ where: { contentHash: record.contentHash } });
      if (existingQuestion || existingDraft) {
        totals.duplicates++;
        continue;
      }

      await db.ingestedQuestionDraft.create({
        data: {
          sourcePdfUrl: record.source.pdfUrl,
          sourceReleaseTag: record.source.releaseTag,
          sourceQuestionId: record.sourceQuestionId,
          rawBlockText: record.rawBlockText,
          extracted: record.extracted as object,
          classification: (record.classification ?? undefined) as object | undefined,
          status: "DRAFT",
          validationErrors: record.errors,
          contentHash: record.contentHash,
        },
      });
      totals.staged++;

      if (index % 100 === 0) {
        console.log(`      ... ${index}/${blocks.length} blocks, ${totals.staged} staged so far`);
      }
    }
  }

  console.log("\n[4/6] Concept classification:", `${totals.mapped}/${totals.blocks} blocks mapped to a syllabus entity`);
  console.log("[5/6] Validation summary (blocks failing each check):");
  for (const [k, v] of [...errorTally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(v).padStart(5)}  ${k}`);
  }
  console.log("[6/6] Result:");
  console.log(`      blocks parsed        : ${totals.blocks}`);
  console.log(`      with answer key      : ${totals.withAnswer}`);
  console.log(`      publishable          : ${totals.publishable}`);
  console.log(`      skipped as duplicate : ${totals.duplicates}`);
  console.log(`      staged as drafts     : ${totals.staged}${args.dryRun ? " (dry run, nothing written)" : ""}`);

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
