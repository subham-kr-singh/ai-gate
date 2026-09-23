import { readFile } from "node:fs/promises";

export interface TextSpan {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

export interface ImageRect {
  /** Page-relative, top-left origin, in the same space as TextLine.x/y. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextLine {
  /** Line text, with spans joined and tabs restored from x-offset gaps. */
  text: string;
  /** Page-relative y, top-down (0 = top of page). */
  y: number;
  x: number;
  fontSize: number;
  spans: TextSpan[];
  /** Right edge of the last span, used for overlap tests. */
  endX: number;
  /** True when an embedded image overlaps this line's band — i.e. the line
   * contains a formula/table rendered as a raster by GO's PDF export. */
  hasImage: boolean;
}

export interface PageText {
  pageNumber: number;
  width: number;
  height: number;
  lines: TextLine[];
  /** Every embedded image placed on the page, with its bbox. */
  images: ImageRect[];
  /** Flattened text for regex work: `lines` joined by \n. */
  text: string;
}

export interface ParsedPdf {
  filePath: string;
  pageCount: number;
  pages: PageText[];
  /** Fonts observed, with how many spans each produced — a proxy for how
   * much of the document is in a math/embedded font that may not have a
   * usable ToUnicode map. */
  fontUsage: Record<string, number>;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

const Y_TOLERANCE = 2.5;

/**
 * Groups the raw text items of a page into lines.
 *
 * pdf.js emits items in a rough reading order but splits a single visual
 * line into many items (one per font/style run), and emits them with
 * per-glyph x/y that drift by fractions of a point. Items are therefore
 * bucketed by y (within Y_TOLERANCE) and sorted by x inside each bucket,
 * which is what makes two-column-ish or indented layouts come out in the
 * right order.
 */
function groupIntoLines(items: PdfTextItem[], pageHeight: number): TextLine[] {
  const spans: TextSpan[] = items
    .filter((it) => it.str.trim().length > 0)
    .map((it) => {
      const t = it.transform;
      return {
        text: it.str,
        x: t[4] ?? 0,
        y: pageHeight - (t[5] ?? 0),
        width: it.width,
        fontSize: Math.abs(t[3] ?? 0) || it.height || 0,
      };
    });

  spans.sort((a, b) => a.y - b.y || a.x - b.x);

  const buckets: TextSpan[][] = [];
  for (const span of spans) {
    const bucket = buckets.find((b) => Math.abs((b[0]?.y ?? 0) - span.y) <= Y_TOLERANCE);
    if (bucket) bucket.push(span);
    else buckets.push([span]);
  }
  buckets.sort((a, b) => (a[0]?.y ?? 0) - (b[0]?.y ?? 0));

  return buckets.map((bucket) => {
    bucket.sort((a, b) => a.x - b.x);
    const first = bucket[0]!;
    let text = "";
    let prevEnd: number | null = null;
    for (const span of bucket) {
      // A gap wider than ~1.2 average chars is a real column break (option
      // tabs, answer-key rows); smaller gaps are just run boundaries.
      const gap = prevEnd === null ? 0 : span.x - prevEnd;
      const charWidth = span.fontSize > 0 ? span.fontSize * 0.5 : 4;
      if (prevEnd !== null && gap > charWidth * 1.2) text += "\t";
      text += span.text;
      prevEnd = span.x + span.width;
    }
    return {
      text: text.replace(/\s+$/, ""),
      y: first.y,
      x: first.x,
      fontSize: Math.max(...bucket.map((s) => s.fontSize)),
      spans: bucket,
      endX: Math.max(...bucket.map((s) => s.x + s.width)),
      hasImage: false,
    };
  });
}

/**
 * Walks a page's operator list tracking the CTM to recover each embedded
 * image's placement rectangle.
 *
 * pdf.js positions images with `transform` (cm) operators whose matrix is
 * often unconventional or negative, so scaling by the matrix skews the bbox
 * badly. The image's *unrotated* page box is instead taken as the axis-aligned
 * envelope of the unit square mapped through the CTM, which is what matters
 * for asking "does a formula image sit on this text line".
 */
function extractImageRects(
  ops: { fnArray: number[]; argsArray: unknown[][] },
  OPS: Record<string, number>,
  viewport: { width: number; height: number }
): ImageRect[] {
  const save = OPS.save;
  const restore = OPS.restore;
  const transform = OPS.transform;
  const paintFns = new Set(
    Object.entries(OPS)
      .filter(([k]) => /^paintImage/.test(k))
      .map(([, v]) => v as number)
  );

  const out: ImageRect[] = [];
  const stack: number[][] = [];
  let ctm = [1, 0, 0, 1, 0, 0];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn === save) {
      stack.push([...ctm]);
      continue;
    }
    if (fn === restore) {
      ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      continue;
    }
    if (fn === transform) {
      const m = ops.argsArray[i] as number[];
      if (Array.isArray(m) && m.length === 6) {
        const [m0, m1, m2, m3, m4, m5] = m as [number, number, number, number, number, number];
        const [c0, c1, c2, c3, c4, c5] = ctm as [number, number, number, number, number, number];
        // ctm = ctm x m
        ctm = [
          c0 * m0 + c2 * m1,
          c1 * m0 + c3 * m1,
          c0 * m2 + c2 * m3,
          c1 * m2 + c3 * m3,
          c0 * m4 + c2 * m5 + c4,
          c1 * m4 + c3 * m5 + c5,
        ];
      }
      continue;
    }
    if (fn === undefined || !paintFns.has(fn)) continue;

    const [a, b, c, d, e, f] = ctm as [number, number, number, number, number, number];
    const xs = [0, 1].flatMap((u) => [0, 1].map((v) => a * u + c * v + e));
    const ys = [0, 1].flatMap((u) => [0, 1].map((v) => b * u + d * v + f));
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const yTop = viewport.height - Math.max(...ys);
    const yBottom = viewport.height - Math.min(...ys);
    const width = Math.abs(x1 - x0);
    const height = Math.abs(yBottom - yTop);
    if (width <= 0 || height <= 0) continue;
    out.push({ x: x0, y: Math.min(yTop, yBottom), width, height });
  }

  return out;
}

/** Extracts text plus line geometry for every page of a local PDF. */
export async function parsePdf(filePath: string): Promise<ParsedPdf> {
  // The legacy build is the one that runs under plain Node without a DOM.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(await readFile(filePath));
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: false,
    // Suppress the "standard font data" fetches; text extraction does not
    // need glyph outlines.
    disableFontFace: true,
  }).promise;

  const pages: PageText[] = [];
  const fontUsage: Record<string, number> = {};

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: PdfTextItem[] = [];
    for (const raw of content.items as unknown[]) {
      const item = raw as PdfTextItem & { type?: string };
      if (typeof item.str !== "string") continue;
      items.push(item);
      if (item.fontName) fontUsage[item.fontName] = (fontUsage[item.fontName] ?? 0) + 1;
    }

    const lines = groupIntoLines(items, viewport.height);

    // Image bboxes are only needed to flag formula-bearing lines, but the
    // operator list is also the only way to see the images at all, so it is
    // read once per page and the images derived from it.
    const opList = await page.getOperatorList();
    const images = extractImageRects(
      opList,
      pdfjs.OPS as unknown as Record<string, number>,
      viewport
    );

    // A line carries rasterised content when an image overlaps its glyph box
    // and lands on its row *as text would*: either inside the line's span, or
    // just to the right of it where a formula would continue the sentence.
    //
    // Two distractors have to be rejected. GO paints 35pt navigation icons in
    // the right margin, which sit on a text row but well past `endX`; and
    // figures sit on their own row below the line that references them. A
    // glyph-scale height limit removes the icons (they are 3-4x the line's
    // font size) and vertical overlap removes the figures, while the
    // `endX + 30` reach still catches an image-only continuation such as the
    // sequence values printed after "I." on the degree-sequence questions.
    for (const line of lines) {
      const glyphTop = line.y - line.fontSize * 0.85;
      const glyphBottom = line.y + line.fontSize * 0.3;
      const glyphHeight = glyphBottom - glyphTop;
      line.hasImage = images.some((img) => {
        const overlap =
          Math.min(img.y + img.height, glyphBottom) - Math.max(img.y, glyphTop);
        if (overlap < Math.min(img.height, glyphHeight) * 0.5) return false;

        const inlineSized = img.height <= line.fontSize * 2.5;
        const insideSpan = img.x >= line.x - 3 && img.x + img.width <= line.endX + 3;
        const rightContinuation = inlineSized && img.x <= line.endX + 30;
        return insideSpan || rightContinuation;
      });
    }

    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      lines,
      images,
      text: lines.map((l) => l.text).join("\n"),
    });
    page.cleanup();
  }

  await doc.destroy();
  return { filePath, pageCount: doc.numPages, pages, fontUsage };
}

/** One page as newline-joined text, for spot-checking extraction quality. */
export function pageText(parsed: ParsedPdf, pageNumber: number): string {
  const page = parsed.pages.find((p) => p.pageNumber === pageNumber);
  return page ? page.text : "";
}
