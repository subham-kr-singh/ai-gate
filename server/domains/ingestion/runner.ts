/**
 * Ingestion runner — the source-agnostic half of the pipeline.
 *
 * Architecture §54: Source -> Fetch -> Parse -> Extract -> Classify ->
 * Deduplicate -> Validate -> Stage -> (human) Publish.
 *
 * The runner owns everything after extraction: syllabus mapping, canonical
 * validation, content hashing, cross-source dedup, and staging as an
 * `IngestedQuestionDraft`. It never writes to `Question`; promotion stays a
 * deliberate human action in `scripts/review-drafts.ts`.
 */
import { db } from "@/server/db/client";
import { classifyConcept } from "./llm-assist";
import { findActiveSyllabusVersion } from "@/server/domains/syllabus/syllabus.repository";
import {
  createConceptMapper,
  subjectCodeFromHint,
  subjectCodeFromTags,
  type ConceptMapping,
  type MappingQuery,
} from "./concept-mapper";
import { assembleRecord, type BuiltRecord } from "./record-builder";
import { findCorroboratingSource, normalizeStatement } from "./dedup";
import {
  RELIABILITY_RANK,
  type ExtractedQuestion,
  type IngestContext,
  type SourceAdapter,
  type SourceUnit,
} from "./sources/types";

export interface RunTotals {
  extracted: number;
  mapped: number;
  publishable: number;
  alreadyKnown: number;
  corroborated: number;
  /** Existing drafts demoted because this run's source outranks them (§48). */
  superseded: number;
  /** Records whose extraction needed an LLM assist (§54 "llm-assisted"). */
  llmAssisted: number;
  staged: number;
  andErrorsByKind: Map<string, number>;
  /** publishable / extracted, as a percentage. */
  yieldPercent: number;
}

export interface RunOptions {
  ctx: IngestContext;
  /** Persist drafts. When false the run is a rehearsal. */
  persist: boolean;
  /** Only stage records that passed every check. */
  publishableOnly: boolean;
  /** Cap on records per unit, for pilots. */
  limit?: number;
}

/** Resolves syllabus IDs for one extracted question.
 *
 * Subject scoping has two routes, because sources differ in what they know:
 *  - GO prints a machine-generated subject tag, so the tag drives the subject;
 *  - a web source knows the chapter it crawled, so it sets `subjectHint`.
 * Whichever the adapter supplied, the hint order it declared is preserved so
 * the reviewer's `matchedOn` stays meaningful. */
async function mapExtracted(
  mapHints: (code: string | null, q: MappingQuery[]) => Promise<ConceptMapping | null>,
  q: ExtractedQuestion
): Promise<ConceptMapping | null> {
  const fromHint = subjectCodeFromHint(q.subjectHint);
  const fromTags = subjectCodeFromTags(q.sourceTags ?? []);
  const subjectCode = fromHint ?? fromTags;

  const queries: MappingQuery[] = q.mappingHints?.length
    ? q.mappingHints.map((h) => ({ text: h.text, matchedOn: h.kind }))
    : [{ text: q.topicHint ?? "", matchedOn: "section-title" }];

  return mapHints(subjectCode, queries);
}

/** The subject a record should be scoped to: the adapter's own tag/hint when
 * it has one, otherwise an explicit subject tag on the block. */
function subjectCodeFor(q: ExtractedQuestion): string | null {
  return subjectCodeFromHint(q.subjectHint) ?? subjectCodeFromTags(q.sourceTags ?? []);
}

/**
 * Runs one unit of one adapter through stages 4-8.
 *
 * Dedup has two layers, per §102 "duplicate content":
 *  - exact: the canonical `contentHash` already exists as a draft or question;
 *  - cross-source: a different source stated the same question, so this record
 *    is kept as corroborating evidence rather than ignored.
 */
export async function runUnit(
  adapter: SourceAdapter,
  unit: SourceUnit,
  opts: RunOptions
): Promise<{ totals: RunTotals; records: BuiltRecord[] }> {
  const version = await findActiveSyllabusVersion();
  if (!version) throw new Error("No active SyllabusVersion — run `npm run seed` first.");
  const mapper = createConceptMapper(version.id);
  const { mapHints, candidateCatalog, mappingFromCatalog } = mapper;

  /**
   * Deterministic mapping first; the assisted classifier only runs when that
   * found nothing *and* the adapter told us the subject.
   *
   * This is Stage 5 of §54, and it is the reason the official archive is
   * usable at all: a paper PDF carries no subject tag, so every question would
   * otherwise land unresolved. The proposal is never trusted as text — the name
   * the model picks is resolved back to syllabus IDs by the deterministic
   * matcher, and the record is flagged below so a reviewer knows to look.
   */
  async function mapWithAssist(q: ExtractedQuestion) {
    const deterministic = await mapExtracted(mapHints, q);
    if (deterministic) return { mapping: deterministic, assisted: false };

    const subjectCode = subjectCodeFor(q);
    const candidates = await candidateCatalog(subjectCode);
    if (candidates.length === 0) return { mapping: null, assisted: false };

    const proposal = await classifyConcept({
      statement: q.statement,
      subjectCode,
      candidates,
    });
    if (!proposal?.label) return { mapping: null, assisted: false };

    const mapping = await mappingFromCatalog(proposal.label);
    return { mapping, assisted: Boolean(mapping) };
  }

  const totals: RunTotals = {
    extracted: 0,
    mapped: 0,
    publishable: 0,
    alreadyKnown: 0,
    corroborated: 0,
    superseded: 0,
    llmAssisted: 0,
    staged: 0,
    andErrorsByKind: new Map(),
    yieldPercent: 0,
  };
  const records: BuiltRecord[] = [];

  for await (const batch of adapter.ingestUnit(unit, opts.ctx)) {
    for (const extracted of batch) {
      // Checked before the record is counted or assembled, so `--limit 25`
      // means 25 records rather than 26.
      if (opts.limit && totals.extracted >= opts.limit) break;
      totals.extracted++;

      const { mapping, assisted } = await mapWithAssist(extracted);
      if (mapping) totals.mapped++;
      if (assisted) totals.llmAssisted++;

      const record = assembleRecord({
        extracted,
        mapping,
        adapterId: adapter.id,
        reliability: adapter.reliability,
        unitId: unit.id,
        license: adapter.license,
      });
      records.push(record);

      for (const err of record.errors) {
        const key = err.split(":")[0] ?? err;
        totals.andErrorsByKind.set(key, (totals.andErrorsByKind.get(key) ?? 0) + 1);
      }

      if (!record.publishable) continue;
      totals.publishable++;

      if (!opts.persist) continue;

      // Exact-duplicate guard: contentHash is unique across drafts and
      // questions, so a re-run (or a question in two volumes) is a no-op.
      const existingQuestion = await db.question.findUnique({ where: { contentHash: record.contentHash } });
      const existingDraft = await db.ingestedQuestionDraft.findUnique({
        where: { contentHash: record.contentHash },
      });
      if (existingQuestion || existingDraft) {
        totals.alreadyKnown++;
        continue;
      }

      const corroborating = await findCorroboratingSource({
        adapterId: adapter.id,
        statement: extracted.statement,
        sourceUrl: extracted.sourceUrl ?? null,
      });
      if (corroborating) {
        totals.corroborated++;
        // §48/§102: when the same question is seen at two tiers, the
        // higher-reliability sighting is the one that should carry the
        // question. If the incoming record is the stronger source, the
        // existing draft is demoted to a corroborating reference rather than
        // both being presented to the reviewer as independent questions.
        const incomingRank = RELIABILITY_RANK[adapter.reliability];
        const existingRank = corroborating.matchedReliability
          ? RELIABILITY_RANK[corroborating.matchedReliability]
          : 0;
        if (incomingRank > existingRank) {
          await db.ingestedQuestionDraft.update({
            where: { id: corroborating.matchedId },
            data: {
              corroboratingSources: [
                {
                  adapterId: adapter.id,
                  sourceUrl: extracted.sourceUrl ?? null,
                  similarity: corroborating.similarity,
                  note: `Superseded by higher-reliability source "${adapter.id}" (${adapter.reliability}).`,
                },
              ] as unknown as object,
            },
          });
          totals.superseded++;
        }
      }

      await db.ingestedQuestionDraft.create({
        data: {
          sourceAdapterId: adapter.id,
          sourceReliability: adapter.reliability,
          sourcePdfUrl: record.source.pdfUrl,
          sourceReleaseTag: record.source.releaseTag,
          sourceQuestionId: record.sourceQuestionId,
          rawBlockText: record.rawBlockText,
          normalizedStatement: normalizeStatement(extracted.statement),
          extracted: record.extracted as object,
          classification: (record.classification ?? undefined) as object | undefined,
          provenance: record.source.provenance as unknown as object,
          corroboratingSources: corroborating ? ([corroborating] as unknown as object) : undefined,
          status: "DRAFT",
          validationErrors: record.errors,
          contentHash: record.contentHash,
        },
      });
      totals.staged++;
    }
    if (opts.limit && totals.extracted >= opts.limit) break;
  }

  totals.yieldPercent =
    totals.extracted === 0 ? 0 : Number(((totals.publishable / totals.extracted) * 100).toFixed(1));
  return { totals, records };
}

export interface MultiRunSummary {
  perUnit: { adapter: string; unit: string; totals: RunTotals }[];
  grand: RunTotals;
  records: BuiltRecord[];
}

function emptyTotals(): RunTotals {
  return {
    extracted: 0,
    mapped: 0,
    publishable: 0,
    alreadyKnown: 0,
    corroborated: 0,
    superseded: 0,
    llmAssisted: 0,
    staged: 0,
    andErrorsByKind: new Map(),
    yieldPercent: 0,
  };
}

function addTotals(into: RunTotals, from: RunTotals): void {
  into.extracted += from.extracted;
  into.mapped += from.mapped;
  into.publishable += from.publishable;
  into.alreadyKnown += from.alreadyKnown;
  into.corroborated += from.corroborated;
  into.superseded += from.superseded;
  into.llmAssisted += from.llmAssisted;
  into.staged += from.staged;
  for (const [k, v] of from.andErrorsByKind) {
    into.andErrorsByKind.set(k, (into.andErrorsByKind.get(k) ?? 0) + v);
  }
}

/** Runs every listed unit of every selected adapter. */
export async function runIngestion(
  adapters: SourceAdapter[],
  opts: RunOptions & { unitFilter?: (adapterId: string, unit: SourceUnit) => boolean }
): Promise<MultiRunSummary> {
  const perUnit: MultiRunSummary["perUnit"] = [];
  const grand = emptyTotals();
  const records: BuiltRecord[] = [];

  for (const adapter of adapters) {
    const units = await adapter.listUnits(opts.ctx);
    const selected = opts.unitFilter
      ? units.filter((u) => opts.unitFilter!(adapter.id, u))
      : units;

    for (const unit of selected) {
      opts.ctx.log(`\n[${adapter.id}] ${unit.label}`);
      const { totals, records: unitRecords } = await runUnit(adapter, unit, opts);
      perUnit.push({ adapter: adapter.id, unit: unit.id, totals });
      addTotals(grand, totals);
      records.push(...unitRecords);
    }
  }

  grand.yieldPercent =
    grand.extracted === 0 ? 0 : Number(((grand.publishable / grand.extracted) * 100).toFixed(1));
  return { perUnit, grand, records };
}

export { normalizeStatement };
