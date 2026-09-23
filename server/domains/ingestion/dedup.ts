/**
 * Cross-source deduplication (architecture §102 "duplicate content").
 *
 * Two layers, deliberately kept separate:
 *
 *  1. **Exact** — `computeContentHash` (statement + type + answer) is unique
 *     across `Question` and `IngestedQuestionDraft`. That catches re-runs and
 *     the same question appearing in two volumes of one source.
 *
 *  2. **Cross-source** — the same question from a *different* source has a
 *     different statement string (different LaTeX, spacing, `<pre>` markup),
 *     so the hash misses it. We normalise the statement down to its
 *     alphanumeric skeleton and compare that.
 *
 * Cross-source hits are NOT dropped. The same question seen twice is evidence
 * the extraction is correct, which is exactly what §53 provenance wants to
 * record, so the second sighting is attached to the draft as a corroborating
 * source rather than discarded.
 */
import { db } from "@/server/db/client";
import { RELIABILITY_RANK, type SourceReliability } from "./sources/types";

/**
 * Reduces a statement to a comparison skeleton: lowercase, LaTeX/HTML
 * stripped, punctuation dropped, whitespace collapsed.
 *
 * The goal is that the same question written by two different pipelines lands
 * on the same string. It is intentionally aggressive — it is only ever used
 * to *propose* a duplicate, and a human still approves the promotion.
 */
export function normalizeStatement(statement: string): string {
  return statement
    .toLowerCase()
    // Drop HTML tags and entities the sources embed ("<br>", "&gt;").
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    // Drop LaTeX control sequences and their braces, keeping the symbols.
    .replace(/\\[a-z]+/g, " ")
    .replace(/[{}$]/g, " ")
    // Collapse "10 k" / "10k" style unit spacing differences.
    .replace(/(\d)\s+(?=[a-z])/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cheap guard so we never call two different questions a duplicate: short
 * skeletons carry too little information to be distinctive. */
const MIN_SKELETON_LENGTH = 60;

export interface Corroboration {
  /** The existing draft or question that states the same question. */
  matchedId: string;
  matchedKind: "draft" | "question";
  /** Adapter id the earlier sighting came from, if known. */
  matchedSource: string | null;
  /** Trust class of the earlier sighting, so the two can be ranked. */
  matchedReliability: SourceReliability | null;
  similarity: number;
}

/**
 * Token-overlap similarity (Jaccard) on normalised statements.
 *
 * Jaccard is used rather than edit distance because the differences between
 * sources are whole-word (markup, extra labels), not character-level typos.
 */
export function statementSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const tok of ta) if (tb.has(tok)) overlap++;
  return overlap / new Set([...ta, ...tb]).size;
}

/** Above this, two statements are treated as the same question. Set high
 * because a false duplicate silently hides a real question from review. */
export const CORROBORATION_THRESHOLD = 0.85;

/** A distinctive token from the middle of a statement. The opening is often
 * formula-heavy or boilerplate ("which of the following"), so the midpoint
 * separates questions far better. */
function probeToken(skeleton: string): string | null {
  const tokens = skeleton.split(" ");
  const probe = tokens[Math.floor(tokens.length / 2)] ?? tokens[0];
  return probe && probe.length >= 4 ? probe : null;
}

/**
 * Looks for an earlier sighting of this question from a *different* source.
 *
 * Candidates are narrowed by a shared distinctive token before the similarity
 * test, because a full pairwise scan of the drafts table would be O(n²) across
 * a multi-source run. The token search runs against `normalizedStatement`
 * rather than `rawBlockText`: both sides of the comparison must be normalised
 * the same way, or LaTeX and markup differences mask a real duplicate.
 *
 * The candidate set is intentionally *not* filtered by reliability — ranking
 * the two sightings against each other is the caller's job, since only the
 * caller knows the incoming record's tier.
 */
export async function findCorroboratingSource(args: {
  adapterId: string;
  statement: string;
  sourceUrl: string | null;
}): Promise<Corroboration | null> {
  const skeleton = normalizeStatement(args.statement);
  if (skeleton.length < MIN_SKELETON_LENGTH) return null;

  const probe = probeToken(skeleton);
  if (!probe) return null;

  const drafts = await db.ingestedQuestionDraft.findMany({
    where: {
      normalizedStatement: { contains: probe },
      // A different source is what makes this corroboration rather than a
      // re-run of the same adapter (which the content hash already handles).
      NOT: { sourceAdapterId: args.adapterId },
    },
    select: {
      id: true,
      normalizedStatement: true,
      sourceAdapterId: true,
      sourceReliability: true,
    },
    take: 25,
  });

  let best: Corroboration | null = null;
  for (const d of drafts) {
    if (!d.normalizedStatement) continue;
    const similarity = statementSimilarity(skeleton, d.normalizedStatement);
    if (similarity >= CORROBORATION_THRESHOLD && (!best || similarity > best.similarity)) {
      best = {
        matchedId: d.id,
        matchedKind: "draft",
        matchedSource: d.sourceAdapterId,
        matchedReliability: d.sourceReliability as SourceReliability,
        similarity,
      };
    }
  }
  return best;
}
