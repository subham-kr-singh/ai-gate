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
  /** Source the earlier sighting came from, if known. */
  matchedSource: string | null;
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

/**
 * Looks for an earlier sighting of this question from a different source.
 *
 * Scans candidates that share a distinctive opening token — a full scan of
 * the drafts table would be O(n²) across a multi-source run.
 */
export async function findCorroboratingSource(args: {
  adapterId: string;
  statement: string;
  sourceUrl: string | null;
}): Promise<Corroboration | null> {
  const skeleton = normalizeStatement(args.statement);
  if (skeleton.length < MIN_SKELETON_LENGTH) return null;

  // A distinctive token from the middle of the statement, to keep the
  // candidate set small without relying on the (often formula-heavy) opening.
  const tokens = skeleton.split(" ");
  const probe = tokens[Math.floor(tokens.length / 2)] ?? tokens[0];
  if (!probe || probe.length < 4) return null;

  const drafts = await db.ingestedQuestionDraft.findMany({
    where: {
      rawBlockText: { contains: probe, mode: "insensitive" },
      NOT: { sourceReleaseTag: args.sourceUrl ?? "" },
    },
    select: { id: true, rawBlockText: true, sourceReleaseTag: true, sourcePdfUrl: true },
    take: 25,
  });

  let best: Corroboration | null = null;
  for (const d of drafts) {
    const similarity = statementSimilarity(skeleton, normalizeStatement(d.rawBlockText));
    if (similarity >= CORROBORATION_THRESHOLD && (!best || similarity > best.similarity)) {
      best = {
        matchedId: d.id,
        matchedKind: "draft",
        matchedSource: d.sourceReleaseTag || d.sourcePdfUrl,
        similarity,
      };
    }
  }
  return best;
}
