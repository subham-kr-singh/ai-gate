/**
 * Minimal HTML helpers for source adapters.
 *
 * Deliberately dependency-free and regex-based rather than a full DOM parser:
 * the sources we read are server-rendered with regular, machine-generated
 * markup, and a parser would be a large dependency for what is a handful of
 * extractions. Every helper is paired with an adapter-level test that pins it
 * against a saved real page, so a markup change fails loudly in CI instead of
 * silently producing empty statements.
 */

/** Decodes the entities the sources actually emit. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&minus;/g, "−")
    .replace(/&times;/g, "×")
    .replace(/&amp;/g, "&");
}

/** Strips tags and collapses whitespace, keeping inline math readable.
 * `<br>` and block-level closers become spaces so "a<br>b" doesn't run
 * together into "ab". */
export function textOf(html: string): string {
  return decodeEntities(
    mathToText(html)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, " ")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recovers inline math from the MathJax SVG the sources embed.
 *
 * Formulas are not text in the HTML: they are `<svg>` glyph runs. Every glyph
 * does, however, carry its Unicode codepoint in `data-c`, in reading order, so
 * the original expression is reconstructible without OCR and without
 * re-rendering. Left alone, a formula becomes an empty gap — which is how a
 * question like "attributes ⟨V, W, X, Y, Z⟩ and primary key ⟨V, W⟩" silently
 * turns into "attributes and primary key", a different question with a
 * different answer.
 *
 * Invisible operators MathJax emits as spacing are dropped, since they are
 * layout hints rather than content.
 */
export function mathToText(html: string): string {
  return html.replace(/<mjx-container[\s\S]*?<\/mjx-container>/gi, (container) => {
    const codes = [...container.matchAll(/data-c="([0-9A-Fa-f]+)"/g)]
      .map((m) => parseInt(m[1] ?? "", 16))
      .filter((n) => !Number.isNaN(n))
      .filter((n) => !INVISIBLE_MATH_CODEPOINTS.has(n))
      .map((n) => String.fromCodePoint(n));
    // A container with no recoverable glyphs is an image-only formula; leave a
    // visible marker so the gap is caught rather than silently ignored.
    return codes.length ? ` ${codes.join("")} ` : " \uFFFD ";
  });
}

/** MathJax spacing/formatting glyphs that carry no content. */
const INVISIBLE_MATH_CODEPOINTS = new Set([
  0x2061, // function application
  0x2062, // invisible times
  0x2063, // invisible separator
  0x200b, // zero-width space
  0x2009, // thin space
  0x2005, // four-per-em space
  0x200a, // hair space
  0x00a0, // nbsp
  0x2064, // invisible plus
]);

/** All attribute values for a given attribute name, in document order. */
export function attrValues(html: string, attr: string): string[] {
  const re = new RegExp(`${attr}="([^"]*)"`, "gi");
  return [...html.matchAll(re)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
}

/** First attribute value, or null. */
export function attr(html: string, attr: string): string | null {
  const m = new RegExp(`${attr}="([^"]*)"`, "i").exec(html);
  return m?.[1] ?? null;
}

/** Inner HTML of the first element whose opening tag matches `openRe`. Handles
 * one level of nesting of the same tag, which covers every container we read. */
export function innerOf(html: string, openRe: RegExp): string | null {
  const open = openRe.exec(html);
  if (!open) return null;
  const tag = /^<\s*([a-z0-9]+)/i.exec(open[0])?.[1];
  if (!tag) return null;

  const start = open.index + open[0].length;
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi");
  re.lastIndex = start;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return html.slice(start);
}

/** True when the text still looks like it is missing inline math. Math is
 * recovered from the SVG glyph runs by `mathToText`; the replacement character
 * it leaves behind means a formula could not be recovered at all. A statement
 * with such a gap is reported as incomplete rather than stored as a question
 * that would be graded against the wrong text. */
export function hasFormulaGap(text: string): boolean {
  return text.includes("\uFFFD");
}
