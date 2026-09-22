import { describe, expect, it } from "vitest";
import { contentHash, extractPage, toSearchText } from "@/server/domains/resources/resource.extract";

const PAGE = `
<html><head><title>Page replacement algorithm - Wikipedia</title></head>
<body>
<h1>Page replacement algorithm</h1>
<p>In a computer operating system that uses paging for virtual memory
management, page replacement algorithms decide which memory pages to page
out when a page of memory needs to be allocated.</p>
<h2>First-in, first-out</h2>
<p>The simplest page replacement algorithm is FIFO. It maintains a queue of
all pages in memory, with the oldest page at the front. When a page needs to
be replaced, the front page is chosen.</p>
<p>FIFO suffers from Belady&rsquo;s anomaly, where increasing the number of
frames can increase the number of page faults.</p>
<h2>Least recently used</h2>
<p>LRU keeps track of page usage over a short period of time. It replaces the
page that has not been used for the longest time.</p>
<script>var x = 1;</script>
<div class="navbox">Navigation junk that should not be indexed at all.</div>
</body></html>`;

describe("extractPage", () => {
  it("reads the title, strips the Wikipedia suffix, and keeps section headings", () => {
    const page = extractPage(PAGE, "fallback")!;
    expect(page.title).toBe("Page replacement algorithm");
    const sections = page.chunks.map((c) => c.section);
    expect(sections).toContain("First-in, first-out");
    expect(sections).toContain("Least recently used");
  });

  it("drops script content and nav chrome", () => {
    const page = extractPage(PAGE, "fallback")!;
    expect(page.text).not.toContain("var x");
    expect(page.text).not.toContain("Navigation junk");
  });

  it("decodes HTML entities", () => {
    const page = extractPage(PAGE, "fallback")!;
    expect(page.text).toContain("Belady’s anomaly");
  });

  it("never lets one chunk span two headings", () => {
    const page = extractPage(PAGE, "fallback")!;
    const fifo = page.chunks.find((c) => c.text.includes("maintains a queue"));
    expect(fifo?.section).toBe("First-in, first-out");
    expect(fifo?.text).not.toContain("LRU keeps track");
  });

  it("returns null for a page with no usable prose", () => {
    expect(extractPage("<html><body><p>hi</p></body></html>", "x")).toBeNull();
  });
});

describe("contentHash", () => {
  it("is stable for identical text and changes when the text changes", () => {
    expect(contentHash("abc")).toBe(contentHash("abc"));
    expect(contentHash("abc")).not.toBe(contentHash("abd"));
  });

  it("distinguishes same-length different text", () => {
    expect(contentHash("aaaa")).not.toBe(contentHash("bbbb"));
  });
});

describe("toSearchText", () => {
  it("lowercases and strips punctuation for lexical matching", () => {
    expect(toSearchText("FIFO, LRU & Belady's!")).toBe("fifo lru belady s");
  });
});
