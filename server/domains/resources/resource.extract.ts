/**
 * server/domains/resources/resource.extract.ts
 *
 * Turning a fetched HTML page into citable passages. Kept free of network and
 * database calls so it can be unit-tested against saved markup.
 *
 * Wiki-style pages mark their sections with <h2>/<h3>; those headings become
 * the citation's section name. A chunk never spans two headings, so "Needs
 * Virtual memory ≥ 70%" style precision survives all the way to the answer.
 */

import { CHUNK_TARGET_CHARS, MAX_CHUNKS_PER_PAGE } from "./resource.config";

export interface ExtractedChunk {
  title: string;
  section: string | null;
  text: string;
}

export interface ExtractedPage {
  title: string;
  text: string;
  chunks: ExtractedChunk[];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  times: "×",
  le: "≤",
  ge: "≥",
  minus: "−",
  // Typographic quotes are common in prose and must not leak as "&rsquo;".
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Removes script/style/nav/table-of-contents noise before we read headings,
 * so the table of contents doesn't get mistaken for a section body. */
function dropNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|form|nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<table\b[\s\S]*?<\/table>/gi, " ")
    .replace(/<div[^>]*class="[^"]*(toc|navbox|reflist|mw-editsection|infobox|sidebar|metadata)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, " ")
    .replace(/<sup\b[\s\S]*?<\/sup>/gi, " ");
}

/** Cuts a long run of text at a sentence boundary near `target`. */
function splitText(text: string, target: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > target) {
    const window = rest.slice(0, target + 200);
    const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
    const at = cut > target * 0.5 ? cut + 1 : target;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/**
 * Extracts the page title, its full plain text, and heading-scoped chunks.
 * Returns null when there is too little prose to be worth storing.
 */
export function extractPage(html: string, fallbackTitle: string): ExtractedPage | null {
  const cleaned = dropNoise(html);

  const titleMatch =
    cleaned.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] ? stripTags(titleMatch[1]) : fallbackTitle).replace(/\s*[-–|]\s*Wikipedia\s*$/i, "").trim() || fallbackTitle;

  // Split on headings, keeping the heading with the body that follows it.
  const parts = cleaned.split(/(<h[23][^>]*>[\s\S]*?<\/h[23]>)/i);
  const chunks: ExtractedChunk[] = [];
  let currentSection: string | null = null;
  const bodies: string[] = [];

  for (const part of parts) {
    const heading = part.match(/^<h[23][^>]*>([\s\S]*?)<\/h[23]>$/i);
    if (heading) {
      currentSection = heading[1] ? stripTags(heading[1]) || null : null;
      continue;
    }
    const text = stripTags(part.replace(/<\/?(p|li|ul|ol|div|section|br)\b[^>]*>/gi, "\n"));
    if (text.length < 40) continue;
    bodies.push(text);

    for (const piece of splitText(text, CHUNK_TARGET_CHARS)) {
      if (piece.length < 40) continue;
      chunks.push({ title, section: currentSection, text: piece });
      if (chunks.length >= MAX_CHUNKS_PER_PAGE) break;
    }
    if (chunks.length >= MAX_CHUNKS_PER_PAGE) break;
  }

  const text = bodies.join("\n\n").trim();
  if (text.length < 40) return null;
  return { title, text, chunks };
}

/** Stable content hash so re-fetching an unchanged page doesn't insert a new
 * version (and doesn't invalidate every citation derived from it). */
export function contentHash(text: string): string {
  // djb2 — not cryptographic, just a compact change detector. Collisions are
  // not a security concern here; a duplicate chunk is harmless.
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `r${(h >>> 0).toString(36)}-${text.length.toString(36)}`;
}

/** Lowercased, punctuation-free text for lexical retrieval. */
export function toSearchText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}
