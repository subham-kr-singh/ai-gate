/**
 * server/domains/resources/resource.service.ts
 *
 * Internet → citable passages, and passages → tutor context.
 *
 *   cron job → fetch page → extract → chunk → dedupe by content hash → store
 *   tutor    → lexical query → rank by reliability + overlap → cite
 *
 * Ingestion is idempotent: re-fetching an unchanged page reuses its existing
 * ResourceVersion (same contentHash) and does not duplicate chunks. A failed
 * fetch never deletes what is already stored — a stale chunk beats no answer.
 */

import { db } from "@/server/db/client";
import { contentHash, extractPage, toSearchText } from "./resource.extract";
import {
  FETCH_TIMEOUT_MS,
  MIN_PAGE_CHARS,
  RELIABILITY_RANK,
  RESOURCE_SOURCES,
  type Reliability,
} from "./resource.config";

export interface IngestResult {
  url: string;
  status: "stored" | "unchanged" | "skipped" | "failed";
  chunks: number;
  error?: string;
}

function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Some hosts refuse requests without a descriptive agent.
        "User-Agent": "GATE-AI-Study-Assistant/1.0 (personal study tool)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves a source's subject name to its Subject row, if it exists. */
async function subjectIdFor(name: string): Promise<string | null> {
  const row = await db.subject.findFirst({ where: { name }, select: { id: true } });
  return row?.id ?? null;
}

export async function ingestOneSource(source: (typeof RESOURCE_SOURCES)[number]): Promise<IngestResult> {
  try {
    const html = await fetchPage(source.url);
    const page = extractPage(html, source.url);
    if (!page || page.text.length < MIN_PAGE_CHARS) {
      return { url: source.url, status: "skipped", chunks: 0 };
    }

    const hash = contentHash(page.text);
    const version = await db.resourceVersion.findUnique({ where: { contentHash: hash }, select: { id: true } });
    if (version) return { url: source.url, status: "unchanged", chunks: 0 };

    const subjectId = await subjectIdFor(source.subject);

    const resource = await db.resource.upsert({
      where: { url: source.url },
      create: {
        url: source.url,
        title: page.title,
        site: siteOf(source.url),
        reliability: source.reliability as Reliability,
        subjectId,
      },
      update: { title: page.title, site: siteOf(source.url), reliability: source.reliability as Reliability, subjectId },
    });

    await db.resourceVersion.create({
      data: {
        resourceId: resource.id,
        contentHash: hash,
        title: page.title,
        text: page.text,
        license: source.license,
        chunks: {
          create: page.chunks.map((c, i) => ({
            resourceId: resource.id,
            title: c.title,
            section: c.section,
            sourceUrl: source.url,
            text: c.text,
            searchText: toSearchText(`${c.title} ${c.section ?? ""} ${c.text}`),
            reliability: source.reliability as Reliability,
            ordinal: i,
          })),
        },
      },
    });

    return { url: source.url, status: "stored", chunks: page.chunks.length };
  } catch (err) {
    return { url: source.url, status: "failed", chunks: 0, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

/** The cron sweep. Failures are collected, never thrown, so one dead host
 * doesn't stop the rest of the sources from refreshing. */
export async function ingestAllSources(sources = RESOURCE_SOURCES): Promise<{
  attempted: number;
  stored: number;
  unchanged: number;
  skipped: number;
  failed: number;
  results: IngestResult[];
}> {
  const results: IngestResult[] = [];
  for (const source of sources) results.push(await ingestOneSource(source));
  return {
    attempted: results.length,
    stored: results.filter((r) => r.status === "stored").length,
    unchanged: results.filter((r) => r.status === "unchanged").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

export interface RetrievedChunk {
  id: string;
  title: string;
  section: string | null;
  sourceUrl: string;
  site: string;
  reliability: Reliability;
  text: string;
  score: number;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "what", "why", "how", "does", "did", "was", "were",
  "are", "is", "of", "to", "in", "on", "a", "an", "it", "its", "as", "at", "by", "be", "or", "not",
  "can", "you", "me", "my", "i", "explain", "tell", "about", "again", "please", "should", "would",
]);

function keywords(query: string): string[] {
  return [...new Set(toSearchText(query).split(" ").filter((w) => w.length > 3 && !STOPWORDS.has(w)))];
}

/**
 * Lexical retrieval over stored chunks. V1 deliberately has no embeddings
 * (architecture §46 defers pgvector), so ranking is term overlap weighted by
 * how rare each term is across the corpus, then nudged by source reliability.
 */
export async function retrieveChunks(query: string, limit = 4): Promise<RetrievedChunk[]> {
  const terms = keywords(query);
  if (!terms.length) return [];

  // Pull a bounded candidate set by term overlap, then score in memory.
  const candidates = await db.resourceChunk.findMany({
    where: { OR: terms.map((t) => ({ searchText: { contains: t } })) },
    select: {
      id: true,
      title: true,
      section: true,
      sourceUrl: true,
      reliability: true,
      text: true,
      searchText: true,
    },
    take: 120,
  });
  if (!candidates.length) return [];

  // Document frequency per term over the candidate set — a term in every
  // chunk is worth less than one in a handful.
  const df = new Map<string, number>();
  for (const t of terms) df.set(t, candidates.filter((c) => c.searchText.includes(t)).length);
  const N = candidates.length;

  return candidates
    .map((c) => {
      let score = 0;
      for (const t of terms) {
        if (!c.searchText.includes(t)) continue;
        const freq = df.get(t) || 1;
        score += Math.log(1 + N / freq) * Math.min(3, c.searchText.split(t).length - 1);
      }
      score *= 0.7 + 0.06 * RELIABILITY_RANK[c.reliability as Reliability];
      return {
        id: c.id,
        title: c.title,
        section: c.section,
        sourceUrl: c.sourceUrl,
        site: siteOf(c.sourceUrl),
        reliability: c.reliability as Reliability,
        text: c.text,
        score,
      };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Library size, for the tutor's "where does this come from" panel. */
export async function getLibraryStats(): Promise<{ resources: number; chunks: number; lastFetchedAt: Date | null }> {
  const [resources, chunks, latest] = await Promise.all([
    db.resource.count(),
    db.resourceChunk.count(),
    db.resource.findFirst({ orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } }),
  ]);
  return { resources, chunks, lastFetchedAt: latest?.fetchedAt ?? null };
}
