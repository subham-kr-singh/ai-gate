# GO-PDFs unit-wise import

Fetches questions from the [GATEOverflow/GO-PDFs](https://github.com/GATEOverflow/GO-PDFs)
releases and stages them in the database **unit by unit** — one printed section
of one volume at a time, addressable by id.

This extends the multi-source ingestion pipeline (`§54`, `§101–103`). It adds no
new extraction logic: parsing, segmentation, syllabus mapping, validation,
dedup and staging are the same code paths the generic `ingest` sweep uses. What
is new is that a *section* of a release is now a first-class unit of work you can
list, import, cap and resume.

---

## 1. What "unit" means here

Three different things in this codebase are called a unit. Keeping them apart
matters, because the review UI and the API surface all three:

| Term | Example | Where it lives |
| --- | --- | --- |
| **Source unit** — what this feature imports | GO section `1.1`, `volume1:2.2` | `IngestedQuestionDraft.sourceUnitId` |
| **Syllabus unit** — what a question is *about* | `OS · Unit 3` | `IngestedQuestionDraft.classification`, `Question.unitId` |
| **Adapter unit** — the generic pipeline's grain | release `gatecse-2026` | `SourceUnit.id` |

A GO section frequently maps onto several syllabus units and one syllabus unit
draws from many sections, so these are not the same axis. The source unit is
recorded separately rather than folded into the syllabus match, which is what
lets you answer "what did section 2.2 give us, and where did it land?"

### Volume-scoped ids

A release can ship more than one PDF, and **each volume numbers its chapters
from 1**. Volume 1 chapter 2 is *Graph Theory*; volume 2 chapter 2 is
*CO & Architecture*; both print a section `2.2`. A bare `2.2` would therefore
let two unrelated sets of questions share a key and be mislabelled in the
review queue.

So a multi-volume release prefixes the id with the volume: `volume1:2.2`,
`volume2:2.2`. The bare printed number is kept on the unit as `section`, and
the CLI accepts it as shorthand **only when it is unambiguous** — on a
multi-volume release, `--unit 2.2` is an error that names both candidates
rather than silently picking one:

```
Error: Unknown unit id "2.2" for release "gatecse-2026".
It matches 2 volumes (volume1:2.2, volume2:2.2) — use the full id.
```

A single-volume release is unaffected: its ids are plain `1.1`, `1.2`, …

---

## 2. Listing the units

```bash
# Unit catalog for one release, grouped by chapter.
npm run ingest -- --source gopdfs --list-units --release gatecse-2026

# Release tags the GitHub repo offers.
npm run ingest -- --source gopdfs --list
```

Output is one line per section, with the block count the segmenter recovered and
the count GO printed in its own table of contents:

```
Chapter 1: Discrete Mathematics: Combinatory  [volume1.pdf]
    - 1.1       4 block(s),    1 fully textual, expected 4, staged 0  Balls In Bins
    - 1.2      22 block(s),    2 fully textual, expected 22, staged 0  Combinatory
Chapter 2: Discrete Mathematics: Graph Theory  [volume1.pdf]
    - volume1:2.2   12 block(s),    4 fully textual, expected 12, staged 0  Degree of Graph
```

`expected` comes from the TOC, `block(s)` from segmentation. The two agreeing is
the signal that a volume was read correctly; a gap means questions were lost in
parsing, and `fully textual` tells you how many survived without rasterised math.

Parser warnings are expected and harmless: PDF.js prints
`UnknownErrorException: Ensure that standardFontDataUrl ... is provided` for
every embedded font it cannot resolve. Text extraction does not need glyph
outlines, so this is noise, not a failure. It goes to stderr, so
`... --list-units ... 2>/dev/null` silences it.

---

## 3. Importing

```bash
# One section.
npm run ingest -- --source gopdfs --release gatecse-2026 --unit volume1:2.2

# Several, in one parse.
npm run ingest -- --source gopdfs --release gatecse-2026 \
  --unit volume1:1.1 --unit volume1:1.2

# Pilot: first N questions of every unit.
npm run ingest -- --source gopdfs --release gatecse-2026 --limit-per-unit 20

# Rehearse without writing.
npm run ingest -- --source gopdfs --release gatecse-2026 --unit volume1:1.1 --dry-run

# Only records that passed every check.
npm run ingest -- --source gopdfs --release gatecse-2026 --publishable-only
```

Each unit reports extracted / mapped / publishable / staged totals:

```
Unit-wise import:
      volume1:2.2 Degree of Graph   extracted   12 | mapped   12 | publishable    1 | staged    1
```

Nothing is published. Imported rows are `IngestedQuestionDraft`s that a human
promotes from `/review`, exactly as in the generic pipeline.

### Why the import is a CLI command and not an API call

Parsing `gatecse-2026` means downloading ~45 MB and spending ~60 s of CPU; a
full walk stages thousands of rows. That does not fit in a serverless
invocation, and PDF.js cannot be bundled into one at all (its worker chunk
resolves to a path that does not exist in a Vercel function — see
[§6](#6-serverless-constraints)). So the HTTP surface is deliberately read-only:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/ingestion/gopdfs/units` | Release tags + which have a catalog |
| `GET /api/ingestion/gopdfs/units?release=…` | The unit catalog with live staged counts |
| `GET /api/ingestion/drafts?units=1` | Source units present in the review queue |
| `GET /api/ingestion/drafts?unit=…` | Queue filtered to one source unit |

The browser shows you what to import and hands you the exact command. Running it
is a deliberate, auditable act rather than a button that can be clicked twice.

---

## 4. The committed catalog

`server/domains/ingestion/catalog/gopdfs-units.json` holds the section structure
of every release, and the API serves it directly:

```
units: 430   blocks: 4303   fullyTextual: 852
```

It exists because building it needs the PDFs and a request cannot have them. It
is **regenerated**, not hand-edited:

```bash
npx tsx --env-file=.env scripts/build-unit-catalog.ts --release gatecse-2026
npx tsx --env-file=.env scripts/build-unit-catalog.ts --releases=gatecse-2026,gatecse-2027
npx tsx --env-file=.env scripts/build-unit-catalog.ts   # every release the repo offers
```

Run it after a release changes. `tests/unit/ingestion-unit-catalog.test.ts`
guards the file's integrity — unique ids, no empty units, totals that agree with
the rows, and a spot-check of the counts GO prints for volume 1 — so a bad
regeneration fails CI instead of surfacing as a confusing review screen.

The file records *structure* only. `alreadyStaged` is computed live on each
request, because it describes the database rather than the release; freezing it
would make the file stale for every database but the one that wrote it.

---

## 5. Reviewing what was imported

`/review` gains a unit selector beside the source filter. It lists only units
that actually have staged drafts, with `(staged, ready)` counts, and each queue
row shows its source unit:

```
All units ▾   volume1 · Degree of Graph (1 staged, 1 ready)
```

Filtering is server-side (`?unit=volume1:2.2`), so a unit with thousands of
drafts is not a scroll to the bottom of a 200-row page.

The unit list is scoped to the selected source and reloaded when the source
changes; a unit that does not exist in the new scope resets the filter to
"All units" rather than showing an empty queue.

---

## 6. Serverless constraints

Two things bite when this code meets Vercel, and both are handled:

**PDF.js cannot be bundled.** Importing `pdf-parser.ts` from a route handler
pulls in `pdfjs-dist`, whose worker chunk Next.js resolves to
`.next/server/vendor-chunks/pdf.worker.mjs` — a file that is not emitted. The
route 500s with `Setting up fake worker failed`. The fix is architectural rather
than a bundler workaround: routes never import the parser. Importing happens in
`scripts/`, which runs under `tsx` on a real filesystem where the worker exists.

**The download cache is not writable.** `fetcher.ts` writes to
`.cache/gopdfs`. On Vercel the deployment filesystem is read-only; only `/tmp`
is writable. This is fine as-is because nothing in a serverless invocation
downloads a PDF, but it is the second reason the import must not move into a
route without that change being made deliberately.

---

## 7. Source fetching

The feature fetches the release assets over the GitHub API directly. There is no
crawling and no LLM in the loop — the text comes out of the PDFs
deterministically, and files are cached locally with a sha256 check so a re-run
does not re-download.

`GITHUB_TOKEN` raises the API rate limit from 60 to 5000 requests/hour, which
matters when walking many releases. Unauthenticated requests work for a single
release.

Reliability is `COMMUNITY`, not `OFFICIAL`: GO-PDFs is a community
reconstruction, so its output is ranked below the official archive (`§48`) and a
corroborating official source outranks it in dedup.

### Extraction fidelity

The honest limitation: many GO blocks contain rasterised math, which the
extractor cannot read. Those blocks are flagged
`Contains N line(s) of rasterised math/formula; the extracted text is
incomplete` and are kept out of the publishable set — a question whose formula
is missing would silently mean something different. In the first volume, 852 of
4303 blocks are fully textual.

So a unit's `publishable` count is often far below its `extracted` count. That
is the pipeline working, not failing: the numbers are visible per unit precisely
so you can see which sections are worth importing and which need the source
reviewed by hand. `fully textual` in the catalog is the number to look at when
choosing where to start.

---

## 8. Known limits

- **One cataloged release.** `gatecse-2026` is in the file. Other tags are
  listed by the API but need `build-unit-catalog.ts` run first; requesting one
  returns a 404 naming that command rather than an empty list.
- **No resume cursor.** A unit already staged is re-examined on a re-run; dedup
  means no duplicate row is created, but the parse cost is paid again. Check
  `staged` in `--list-units` before re-running a large unit.
- **Volume-level parse cost.** Even `--unit volume2:1.1` parses the whole of
  volume 2 (~37 s cold) because segmentation needs the full line stream to find
  section boundaries. Cached files make the download free; the parse is not
  cached.
- **Rasterised math is not recovered.** Blocks with images are staged for review
  but cannot be published as-is. OCR or an LLM pass would be a separate feature,
  and would change the record's `extractionSource` to `llm-assisted`.

---

## 9. Tests

```
tests/unit/ingestion-unit-grouping.test.ts   13 tests  grouping + id resolution
tests/unit/ingestion-unit-catalog.test.ts     9 tests  committed catalog integrity
```

The grouping tests are the important ones: they pin the two failures that are
otherwise silent — a section with no TOC row being dropped instead of imported,
and section ids colliding across volumes. The resolution tests pin the ambiguity
refusal, which is the difference between an error message and importing the
wrong subject's questions.
