# GO-PDFs Question Ingestion Pipeline — Report

Implementation of architecture §54 (Content Ingestion Pipeline) for importing
GATE previous-year questions from the [GO-PDFs](https://github.com/GATEOverflow/GO-PDFs)
GitHub releases into this app.

## Pipeline stages

§54's chain maps to code as follows.

| §54 stage | Implementation |
| --- | --- |
| Source / Fetcher / Raw Artifact / Hash | `server/domains/ingestion/fetcher.ts` — downloads release PDFs into `.cache/gopdfs/<tag>/`, keyed by sha256 so a re-run is a cache hit |
| Parser | `server/domains/ingestion/pdf-parser.ts` — pdf.js text + per-line geometry + image bounding boxes |
| Normalizer / Metadata Extractor / Question Extractor | `server/domains/ingestion/segmenter.ts` — TOC, question blocks, options, GO metadata tags, answer keys |
| Concept Classifier | `server/domains/ingestion/concept-mapper.ts` — GO tag → subject, section title → unit/topic/concept |
| Deduplicator | `contentHash` unique constraint on both `Question` and `IngestedQuestionDraft` |
| Validator | `server/domains/ingestion/record-builder.ts` — canonical Zod schema plus source-quality checks |
| Review / Publish | `scripts/review-drafts.ts` — explicit human approval only |

Entry points:

```bash
npm run ingest:gopdfs -- --release gatecse-2026          # fetch, parse, validate, stage
npm run ingest:gopdfs -- --release gatecse-2026 --dry-run # same, writes nothing
npm run drafts -- --list                                 # queue overview
npm run drafts -- --show <draftId>                       # one draft, with raw text
npm run drafts -- --approve <draftId> [...]              # promote to Question
npm run drafts -- --reject  <draftId> [...]
```

## Human review gate

The pipeline **never** writes to `Question`. Every extracted question lands in
`IngestedQuestionDraft`, and promotion happens only through
`scripts/review-drafts.ts --approve <id>`, which requires the reviewer to name
the drafts. There is deliberately no "approve all" switch. The draft's payload
is re-validated against the Zod schema at the moment of promotion, and a draft
carrying any validation note cannot be approved at all — it must be fixed or
rejected.

## Current extraction fidelity

Run over `gatecse-2026` (volume 1: 373 pages, volume 2: 696 pages):

```
blocks parsed        : 4303
with answer key      : 4291   (99.7%)
publishable          : 625
staged as drafts     : 623    (2 dropped as cross-volume duplicates)
classified to a subject: ~80.5%
```

### Why only ~15% is publishable

GO-PDFs rasterises most mathematics and most MCQ option bodies as images. On the
sampled pages, 75–80% of question blocks contain at least one rasterised
formula. pdf.js extracts the surrounding prose perfectly but cannot recover the
math, so a question can come out looking like:

> The degree sequence of a simple graph is the sequence ... in decreasing order.
> Which of the following sequences can not be the degree sequence of any graph?
> I.  II.  III.  IV.

Detecting this is load-bearing, not cosmetic: publishing those statements would
silently change the meaning of the question and produce questions that cannot be
answered. `pdf-parser.ts` therefore computes each image's bounding box by walking
the page operator list (tracking the CTM through `save`/`restore`/`transform`),
and flags any text line that a glyph-sized image overlaps. The block then carries
`hasImageContent`, which the validator turns into a blocking note.

Two classes of false positive had to be excluded, and the geometry rules encode
both:

- GO prints 35 pt navigation icons in the right margin that sit on a text row
  but well past `endX`. A height limit (`<= 2.5x` the line's font size) rejects
  them.
- Figures (e.g. a process state diagram) are placed on their own row below the
  line that references them, sometimes overlapping the line's box. Requiring
  half the image to overlap the line's *glyph box* rejects them.

The same rules still catch the genuine cases: inline formula tokens sitting in
word gaps, and image-only continuations such as the printed sequence values
after `I.` (reached by allowing glyph-sized images up to 30 pt past `endX`).

The remaining ~85% need one of:

1. **Formula recovery.** A vision/LaTeX model over the flagged image regions, or
   a math-aware parser, would convert the largest blocked group.
2. **Better segmentation of image-only options.** 6.5% of option cells are
   empty because the whole option is an image.
3. **A larger synonym table.** 782 blocks have no subject tag at all, and the
   remaining unmapped sections are mostly near-misses against syllabus wording.
   `concept-mapper.ts` scores 80.5% now; the synonym table is the place to push
   that up.

## Data model

`IngestedQuestionDraft` (one row per extracted question):

- `sourcePdfUrl`, `sourceReleaseTag`, `sourceQuestionId` — provenance (§53)
- `rawBlockText` — the original PDF text, kept beside `extracted` so a reviewer
  never has to re-open the PDF
- `extracted` — the canonical, Zod-validated question payload
- `classification` — subject/unit/topic/concept ids, confidence and rationale,
  so the reviewer can audit the classifier rather than trust it
- `validationErrors` — why the record is not publishable (blocking)
- `contentHash` — unique, making ingestion idempotent
- `promotedQuestionId` — set on approval, linking to the created `Question`

## Verified behaviour

- **Fetch idempotency**: first run `cached=false`, re-run `cached=true`, hash stable.
- **Ingestion idempotency**: second run reports `staged 0`, `skipped as duplicate 652`.
- **Deduplication**: 2 questions appear in both volumes and are dropped on the second sighting.
- **Promotion**: approved drafts create `Question` rows with status `APPROVED`,
  linked back via `promotedQuestionId`, correctly filed under the mapped
  subject/topic (e.g. MATH / Graph Theory, concept "Coloring").
- **Blocking**: drafts with validation notes are refused by `--approve`.
- `npm run typecheck`, `npm test` (208 passing) and `npm run build` all pass.

## Unit tests

`tests/unit/ingestion-record-builder.test.ts` covers the pure logic with real
inputs taken from the source PDFs: NAT exact values, equal-value pairs,
two-sided ranges, the bracketed tolerance form, and multi-select separators.

## Build / deploy notes

- `pdfjs-dist` is a devDependency. Nothing under `app/` imports the ingestion
  modules — they run only from `scripts/` — so the PDF parser is never bundled
  into the Next.js build and does not affect the Vercel deploy.
- `prisma generate` runs in `postinstall` and in `vercel-build`, so the
  migrations apply on deploy without further config.
- `.cache/` (the downloaded PDFs, ~45 MB) is gitignored.
