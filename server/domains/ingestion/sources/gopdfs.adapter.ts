/**
 * GO-PDFs adapter — the GATEOverflow question PDFs published as GitHub
 * release assets.
 *
 * This is a port of the original `scripts/ingest-gopdfs.ts` onto the
 * `SourceAdapter` interface. The PDF-specific work (parse -> segment) stays
 * here; mapping, validation, hashing, dedup and staging are shared and live
 * in the runner.
 *
 * Extraction fidelity is the reason the review gate exists: GO prints most
 * math as rasterised images, so a large share of blocks come back with
 * incomplete statements and are reported as unpublishable rather than
 * silently published. See docs/ingestion-pipeline-report.md.
 */
import { fetchReleaseAssets, listReleases, type DownloadedAsset } from "../fetcher";
import { parsePdf } from "../pdf-parser";
import { segmentVolume, type QuestionBlock } from "../segmenter";
import type {
  ExtractedQuestion,
  IngestContext,
  SourceAdapter,
  SourceUnit,
} from "./types";

/** GO's metadata tag -> canonical marks. */
function parseMarks(tags: string[]): number {
  return tags.includes("two-marks") ? 2 : 1;
}

/** GO prints a coarse difficulty tag; map it onto the app's 1..5 scale. */
function parseDifficulty(tags: string[]): number {
  if (tags.includes("easy")) return 2;
  if (tags.includes("hard")) return 4;
  if (tags.includes("medium")) return 4;
  return 3;
}

/** GO's block tags imply the question type. */
export function inferType(block: QuestionBlock): "MCQ" | "MSQ" | "NAT" | null {
  if (block.tags.includes("numerical-answers")) return "NAT";
  if (block.tags.includes("multiple-selects")) return "MSQ";
  if (block.options.length >= 2) return "MCQ";
  return null;
}

/** Converts one segmented GO block plus its answer-key cell into the
 * adapter-neutral shape. Source-level problems (rasterised math, a missing
 * answer) are reported here; schema-level ones are added later. */
export function blockToExtracted(args: {
  block: QuestionBlock;
  answer: string | undefined;
  releaseTag: string;
  pdfUrl: string;
  artifactHash?: string;
}): ExtractedQuestion {
  const { block, answer, releaseTag, pdfUrl, artifactHash } = args;
  const errors: string[] = [];

  if (block.hasImageContent) {
    errors.push(
      `Contains ${block.imageLineCount} line(s) of rasterised math/formula; the extracted text is incomplete.`
    );
  }

  // A missing/`N/A` answer is reported by the assembler, which sees the
  // canonical field — reporting it here too would double the error.
  const ans = (answer ?? "").trim();
  const hasAnswer = ans.length > 0 && ans.toUpperCase() !== "N/A";

  const page = block.startPage;
  return {
    sourceQuestionId: block.id,
    statement: block.statement,
    options: block.options.map((o) => ({ id: o.label, text: o.text })),
    correctAnswer: hasAnswer ? ans : undefined,
    type: inferType(block) ?? undefined,
    year: block.year,
    exam: block.examLabel,
    questionRef: block.questionRef,
    marks: parseMarks(block.tags),
    negativeMarks: 0,
    difficulty: parseDifficulty(block.tags),
    // GO's own tags are the reliable subject signal; the mapper resolves them.
    subjectHint: null,
    // Ordered exactly as the pre-refactor mapper tried them, so the syllabus
    // match for a given block is unchanged by this refactor.
    mappingHints: [
      { text: block.sectionTitle ?? "", kind: "section-title" },
      { text: block.topicTitle ?? "", kind: "tag" },
      { text: block.chapterTitle ?? "", kind: "chapter-title" },
    ],
    sourceTags: block.tags,
    rawText: block.rawBlockText,
    page,
    artifactUrl: pdfUrl,
    sourceUrl: `${pdfUrl}#page=${page}`,
    errors,
    provenance: [
      { url: pdfUrl, kind: "pdf", artifactHash },
      { url: `${pdfUrl}#page=${page}`, kind: "question" },
    ],
    // GO's PDFs are machine-generated, so extraction is as good as the
    // source allows; the rasterised-content check above is what caps this.
    extractionConfidence: block.hasImageContent ? 0.4 : 0.9,
  };
}

export class GopdfsAdapter implements SourceAdapter {
  readonly id = "gopdfs";
  readonly label = "GATEOverflow question PDFs (GitHub releases)";
  readonly reliability = "COMMUNITY" as const;
  readonly license = "go-pdfs";
  readonly homepage = "https://github.com/GATEOverflow/GO-PDFs";

  /** `params.release` pins one release; otherwise every release is offered. */
  async listUnits(ctx: IngestContext): Promise<SourceUnit[]> {
    const releases = await listReleases();
    ctx.log(`      ${releases.length} release(s) available`);
    return releases.map((r) => ({
      id: r.tag,
      label: `${r.tag}${r.publishedAt ? ` (${r.publishedAt.slice(0, 10)})` : ""}`,
      group: "GO-PDFs",
      params: { assetCount: r.assets.filter((a) => a.name.toLowerCase().endsWith(".pdf")).length },
    }));
  }

  async *ingestUnit(unit: SourceUnit, ctx: IngestContext): AsyncIterable<ExtractedQuestion[]> {
    const assets: DownloadedAsset[] = await fetchReleaseAssets(unit.id);
    ctx.log(`      ${assets.length} PDF(s): ${assets.map((a) => a.name).join(", ")}`);

    for (const asset of assets) {
      const parsed = await parsePdf(asset.filePath);
      const seg = segmentVolume(parsed);
      ctx.log(
        `      ${asset.name}: ${seg.blocks.length} block(s), ${seg.answers.size} answer-key entr(ies)`
      );

      const blocks = ctx.limit ? seg.blocks.slice(0, ctx.limit) : seg.blocks;
      const batch: ExtractedQuestion[] = [];
      for (const block of blocks) {
        batch.push(
          blockToExtracted({
            block,
            answer: seg.answers.get(block.id),
            releaseTag: unit.id,
            pdfUrl: asset.url,
            artifactHash: asset.contentHash,
          })
        );
        // Bounded batches keep memory flat on a 4000-block volume.
        if (batch.length >= 200) {
          yield batch.splice(0, batch.length);
        }
      }
      if (batch.length > 0) yield batch.splice(0, batch.length);
    }
  }
}
