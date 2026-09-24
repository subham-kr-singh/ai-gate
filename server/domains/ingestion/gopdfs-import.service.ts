/**
 * Unit-wise GO-PDFs import.
 *
 * `scripts/ingest.ts --source gopdfs` walks a release the generic way: it
 * downloads every PDF, segments it, and stages whatever it finds. That is the
 * right thing for a full sweep, but it makes a poor "fetch questions and save
 * them in the DB, unit by unit" control:
 *
 *  - the unit is a whole release (thousands of questions), not a syllabus unit;
 *  - there is no way to import one chapter and stop;
 *  - a re-run re-parses a 27 MB PDF to discover it has nothing new.
 *
 * This module exposes the release as an addressable list of units (GO's
 * printed sections), so a caller can list them, import one, or import several
 * with a per-unit cap and a resume cursor. It reuses `createPipeline` for
 * mapping/validation/staging so both paths agree on what a draft is.
 *
 * Cost note, because it shapes the API: parsing one volume takes ~20-40s and
 * 45 MB of download on a cold cache. A serverless request cannot do that, so
 * the HTTP surface is read-only for the catalog and points at the CLI for the
 * actual import. See docs/gopdfs-unit-import.md.
 */
import { db } from "@/server/db/client";
import { listReleases, fetchReleaseAssets, type DownloadedAsset } from "./fetcher";
import { parsePdf } from "./pdf-parser";
import { groupIntoUnits, segmentVolume, type VolumeUnit, type SegmentedVolume } from "./segmenter";
import { blockToExtracted, GopdfsAdapter } from "./sources/gopdfs.adapter";
import { createPipeline, type RunTotals } from "./runner";
import type { IngestContext, SourceUnit } from "./sources/types";

export interface ReleaseUnitSummary {
  /** Unit id within the release, e.g. "1.1" or "volume1:2.2". */
  id: string;
  /** The printed section number, without any volume prefix. */
  section: string;
  label: string;
  chapter: number;
  chapterTitle: string | null;
  /** Which PDF of the release it lives in. */
  volume: string;
  /** Questions GO printed for this section (from the TOC). */
  expectedCount: number | null;
  /** Blocks the segmenter recovered, which can include extra unattributed ones. */
  blockCount: number;
  /** How many of those did not carry rasterised math. */
  fullyTextual: number;
  /** How many are already staged as drafts in the DB for this release+unit. */
  alreadyStaged: number;
  exams: string[];
}

export interface ReleaseUnitCatalog {
  release: string;
  units: ReleaseUnitSummary[];
  totals: {
    units: number;
    blocks: number;
    fullyTextual: number;
    alreadyStaged: number;
  };
}

export interface UnitImportResult {
  release: string;
  unitId: string;
  unitLabel: string;
  /** Drafts newly created by this run. */
  staged: number;
  totals: RunTotals;
}

export interface UnitImportOptions {
  release: string;
  /** Unit ids to import. Empty/undefined means every unit in the release. */
  unitIds?: string[];
  /** Cap on questions examined per unit. */
  limitPerUnit?: number;
  /** Stage drafts. False rehearses the run without writing. */
  persist?: boolean;
  /** Only stage records that passed every check. */
  publishableOnly?: boolean;
  ctx: IngestContext;
}

const adapter = new GopdfsAdapter();

/** "volume1.pdf" -> "volume1"; used to disambiguate section ids. */
function volumeKey(assetName: string): string {
  return assetName.replace(/\.pdf$/i, "");
}

/**
 * Maps caller-supplied unit ids onto the catalog's real ids.
 *
 * A single-volume release is addressed by its printed section number ("2.2"),
 * which reads naturally and is what someone has in front of them. A
 * multi-volume release needs the volume prefix because "2.2" exists in each;
 * passing the bare number there is an error rather than a guess, since picking
 * one volume silently would import the wrong subject's questions.
 *
 * Exported so the rules can be tested without parsing a PDF.
 */
export function resolveUnitIds(
  requested: string[],
  available: { id: string; section: string }[],
  release: string
): Set<string> {
  const byId = new Set(available.map((u) => u.id));
  const resolved = new Set<string>();

  for (const id of requested) {
    if (byId.has(id)) {
      resolved.add(id);
      continue;
    }
    const matches = available.filter((u) => u.section === id);
    if (matches.length === 1) {
      resolved.add(matches[0]!.id);
      continue;
    }
    const hint =
      matches.length > 1
        ? `It matches ${matches.length} volumes (${matches.map((m) => m.id).join(", ")}) — use the full id.`
        : "Run with --list-units to see valid ids.";
    throw new Error(`Unknown unit id "${id}" for release "${release}". ${hint}`);
  }

  return resolved;
}

/** Parses every PDF of a release once and returns the segmented volumes,
 * keyed by asset name. Parsing is the expensive part, so both the catalog and
 * the importer go through here and a single command pays for it once. */
async function segmentRelease(
  release: string,
  ctx: IngestContext
): Promise<{ assets: DownloadedAsset[]; volumes: { asset: DownloadedAsset; seg: SegmentedVolume }[] }> {
  const assets = await fetchReleaseAssets(release);
  ctx.log(`      ${assets.length} PDF(s): ${assets.map((a) => a.name).join(", ")}`);

  const volumes: { asset: DownloadedAsset; seg: SegmentedVolume }[] = [];
  for (const asset of assets) {
    const parsed = await parsePdf(asset.filePath);
    const seg = segmentVolume(parsed);
    ctx.log(
      `      ${asset.name}: ${seg.blocks.length} block(s), ${seg.answers.size} answer-key entr(ies)`
    );
    volumes.push({ asset, seg });
  }
  return { assets, volumes };
}

/**
 * Every importable unit of a release, with how much is already in the DB.
 *
 * `alreadyStaged` is counted per (release, unit) rather than read from a run
 * log: the draft rows are the source of truth, so the number stays correct
 * after a manual review pass deletes or promotes drafts.
 */
export async function listReleaseUnits(
  release: string,
  ctx: IngestContext
): Promise<ReleaseUnitCatalog> {
  const { volumes } = await segmentRelease(release, ctx);

  const staged = await db.ingestedQuestionDraft.groupBy({
    by: ["sourceUnitId"],
    where: { sourceAdapterId: adapter.id, sourceReleaseTag: release },
    _count: { _all: true },
  });
  const stagedByUnit = new Map(
    staged.filter((s) => s.sourceUnitId).map((s) => [s.sourceUnitId as string, s._count._all])
  );

  const multiVolume = volumes.length > 1;
  const units: ReleaseUnitSummary[] = [];
  for (const { asset, seg } of volumes) {
    for (const u of groupIntoUnits(seg, multiVolume ? { volumeKey: volumeKey(asset.name) } : undefined)) {
      units.push({
        id: u.id,
        section: u.section,
        label: u.label,
        chapter: u.chapter,
        chapterTitle: u.chapterTitle,
        volume: asset.name,
        expectedCount: u.expectedCount,
        blockCount: u.blocks.length,
        fullyTextual: u.fullyTextual,
        alreadyStaged: stagedByUnit.get(u.id) ?? 0,
        exams: u.exams,
      });
    }
  }

  return {
    release,
    units,
    totals: {
      units: units.length,
      blocks: units.reduce((n, u) => n + u.blockCount, 0),
      fullyTextual: units.reduce((n, u) => n + u.fullyTextual, 0),
      alreadyStaged: units.reduce((n, u) => n + u.alreadyStaged, 0),
    },
  };
}

/**
 * Imports the selected units of one release into the draft table.
 *
 * Every question is filed with its `sourceUnitId`, which is what makes the
 * result browsable unit by unit in the review queue. Staging goes through the
 * shared pipeline, so dedup, corroboration and the publishable-only rule
 * behave exactly as they do for a generic sweep.
 */
export async function importReleaseUnits(opts: UnitImportOptions): Promise<UnitImportResult[]> {
  const { release, ctx } = opts;
  const persist = opts.persist ?? true;
  const wanted = opts.unitIds && opts.unitIds.length > 0 ? new Set(opts.unitIds) : null;

  const { volumes } = await segmentRelease(release, ctx);

  const multiVolume = volumes.length > 1;
  const groupOf = (name: string) => (multiVolume ? { volumeKey: volumeKey(name) } : undefined);

  // Resolve the requested ids up front so a typo fails loudly rather than
  // silently importing nothing. A bare section number ("2.2") is accepted as
  // shorthand when unambiguous, so the single-volume case reads naturally and
  // a multi-volume typo is still caught rather than importing the wrong thing.
  const available = new Map<string, VolumeUnit>();
  for (const { asset, seg } of volumes) {
    for (const u of groupIntoUnits(seg, groupOf(asset.name))) available.set(u.id, u);
  }
  const wantedResolved = wanted
    ? resolveUnitIds([...wanted], [...available.values()], release)
    : null;

  const results: UnitImportResult[] = [];

  for (const { asset, seg } of volumes) {
    for (const unit of groupIntoUnits(seg, groupOf(asset.name))) {
      if (wantedResolved && !wantedResolved.has(unit.id)) continue;

      ctx.log(`\n      [${release}] ${unit.id} ${unit.label} — ${unit.blocks.length} block(s)`);

      // One pipeline per unit: it carries the unit stamp, and it keeps each
      // unit's totals separable in the report without bookkeeping arithmetic.
      const pipeline = await createPipeline(adapter, {
        ctx,
        persist,
        publishableOnly: opts.publishableOnly ?? false,
        sourceUnitId: unit.id,
        sourceUnitLabel: unit.label,
      });

      let processedInUnit = 0;
      for (const block of unit.blocks) {
        if (opts.limitPerUnit && processedInUnit >= opts.limitPerUnit) break;
        processedInUnit++;

        const extracted = blockToExtracted({
          block,
          answer: seg.answers.get(block.id),
          releaseTag: release,
          pdfUrl: asset.url,
          artifactHash: asset.contentHash,
        });

        await pipeline.processOne(extracted, release);
      }

      pipeline.finalize();
      results.push({
        release,
        unitId: unit.id,
        unitLabel: unit.label,
        staged: pipeline.totals.staged,
        totals: pipeline.totals,
      });
    }
  }

  return results;
}

/** Release tags offered by the GO-PDFs GitHub repo, newest first. */
export async function listGopdfsReleases(): Promise<SourceUnit[]> {
  const releases = await listReleases();
  return releases.map((r) => ({
    id: r.tag,
    label: `${r.tag}${r.publishedAt ? ` (${r.publishedAt.slice(0, 10)})` : ""}`,
    group: "GO-PDFs",
    params: { assets: r.assets.filter((a) => a.name.toLowerCase().endsWith(".pdf")).length },
  }));
}
