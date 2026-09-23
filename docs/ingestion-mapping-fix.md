# Ingestion Mapping Fix — Report

Follow-up to `docs/ingestion-pipeline-report.md`. This round diagnosed why the
official-archive pilot was yielding 1 publishable question out of 65, and fixed
the cause.

## Symptom

```
official-archive/2026-CS1  extracted 65 | mapped 1 | publishable 1 | yield 1.5%
        210  Schema
         64  Could not resolve a syllabus subject/unit/topic for this block.
         17  Contains rasterised math/formula; ...
```

The 210 "Schema" failures were not 210 independent problems: the Zod schema
requires `subjectId`, `unitId` and `topicId`, so each of the 64 unmapped blocks
produced three cascading `Required` messages. One root cause, 192 of the
reported errors.

## Root cause: the subject hint did not exist in the syllabus

The archive adapter tags a paper by its paper code:

```ts
const PAPER_SUBJECT: Record<string, string> = { CS1: "CS", CS2: "CS", GA: "GA" };
```

`CS` is a real paper label, but it is not a syllabus subject. The seeded
syllabus splits computer science into ten subjects:

```
ALGO | CD | CN | COA | DBMS | DL | GA | MATH | OS | PDS | TOC
```

There is no `CS` row, so `subjectByCode("CS")` returned null and the mapper
bailed out before it looked at anything:

```ts
async function mapHints(subjectCode, queries) {
  if (!subjectCode) return null;              // ← never true here
  const subject = subjectRows.find(s => s.code === subjectCode);
  if (!subject) return null;                  // ← always returned here
```

Every CS-1 and CS-2 question was structurally unmappable. The 1 question that
did map was a GA question, whose hint (`GA`) *is* a real subject.

## Root cause 2: the assisted classifier was dead code

Architecture §54 Stage 5 provides for an AI-assisted concept classifier when the
deterministic mapper cannot resolve a block. `server/domains/ingestion/llm-assist.ts`
implemented `classifyConcept` and `reformatBlock` fully — budget-guarded,
schema-validated, with its own stats counters — but nothing imported it:

```
$ grep -rn "classifyConcept" server/ scripts/ | grep -v llm-assist.ts
(no matches)
```

So the designed fallback never ran, and the unmappable blocks had no second
chance. This is the substantive gap this round closed.

## What changed

### `concept-mapper.ts` — a subject-aware candidate catalog

Because a CS paper is one subject to the source and ten to the syllabus,
candidate scoping had to change. The mapper gained:

- `candidateCatalog(subjectCode)` — returns every candidate as
  `SUBJECT_CODE:name` (307 entries for a CS paper). When the hint does not name
  a syllabus subject it widens to the whole syllabus rather than returning
  nothing.
- `mappingFromCatalog(label)` — parses the `CODE:name` pick and resolves it
  against syllabus IDs, filtering by subject so a pick that crosses subjects is
  corrected rather than trusted.
- `parseCatalogLabel(label)` — the pure, exported trust boundary for model text.
  Splits on the *first* colon only, so names containing colons survive.
- `matchedOn: "assisted-exact"` — a new match kind so reviews can tell a
  model-suggested mapping from a deterministic one at a glance.

### `llm-assist.ts` — proposal shape matches the catalog

`ConceptProposalSchema` changed from two free-text `unitName`/`topicName` fields
to one `label` field the model must copy verbatim from the candidate list.
The prompt now states the `SUBJECT_CODE:name` format and that the entry must be
copied exactly. This is narrower than before: the model can only select a string
the syllabus already contains, and the deterministic matcher still has the final
say on whether it resolves.

### `runner.ts` — the assisted path is wired in

`runUnit` now resolves each question as:

1. deterministic mapping (`mapHints`) — unchanged, runs first;
2. only if that fails, fetch the catalog for the question's subject;
3. ask `classifyConcept` to pick one entry;
4. resolve that pick back through `mappingFromCatalog`.

An assisted mapping increments `totals.llmAssisted`, so the run report shows how
many records a human should look at closely. Assisted mappings carry
`confidence: 0.5`, deliberately below the deterministic bar.

## Constraints preserved

- **No LLM crawling.** `classifyConcept` still receives only the statement text
  and a candidate list. It gets no URL, no HTML, and no PDF bytes.
- **No auto-publish.** The assisted path feeds the same `assembleRecord` and
  the same `IngestedQuestionDraft` gate. Promotion is still CLI-only via
  `scripts/review-drafts.ts --approve <id>`.
- **Deterministic degradation.** Without `GEMINI_API_KEY`/`LLM_API_KEY`,
  `llmAssistEnabled()` is false, `classifyConcept` returns null, and the run
  completes exactly as before. Re-running the archive pilot with no key still
  reports `65 extracted | 1 mapped | 1.5% yield` and exits 0 — it does **not**
  crash or stage garbage.
- **robots.txt** remains centralised in `sources/http.ts`, checked before the
  first request to any host.

## Verification

```
$ npx tsc --noEmit        # clean
$ npx next lint           # No ESLint warnings or errors
$ npx vitest run          # 272 passed, 16 skipped (288)
$ npx next build          # Compiled successfully
```

New tests (`tests/unit/concept-catalog-label.test.ts`, 5 cases) cover the
trust boundary: well-formed entries, lowercase/padded codes, names that contain
their own colon, a bare unit name with no prefix, and empty/malformed input.

A production smoke test (`next build` + `next start`) returns 200 on `/login`,
`/practice`, `/planner`, `/reports` and `/tutor`; `/` 307s to `/login` when
unauthenticated; a malformed id 404s and a well-formed one serves the app.

Live check against the seeded database confirms the catalog is non-empty and
resolution behaves:

```
CS catalog entries: 307
sample: ALGO:Algorithm Analysis & Asymptotic Notations | ALGO:Algorithm analysis | ...
DBMS:Normalization        -> resolved (DBMS, assisted-exact)
OS:Process Synchronization-> unresolved      (that exact name is not in the syllabus)
NOT_A_SUBJECT:Whatever    -> unresolved      (unknown subject code rejected)
```

## Expected effect on the pilot

Remaining, and *not* fixed by this change:

| Count | Cause | Status |
| --- | --- | --- |
| 64 | no syllabus mapping | fixed when an LLM key is configured; otherwise unchanged |
| 17 | rasterised math (`hasImageContent`) | needs manual transcription; correct to block |
| 5 | option text not extractable (images) | needs manual transcription; correct to block |
| 1 | `"4.24 to 4.26"` not a parseable NAT range | **fixed** this round |

The 17 + 5 image cases are the pipeline working as intended: publishing them
would silently change the question's meaning.

`parseNatAnswer` gained one branch for the prose band form. The word `to` is
required, so two adjacent numbers with no separator are still rejected as
ambiguous rather than read as a range. The live run confirms it: the
`not a parseable number or range` note is gone and the total dropped 210 → 209.

## Next steps

- Configure `GEMINI_API_KEY` and re-run the CS-1 pilot to measure the assisted
  mapping rate and confirm the `Schema` failure count drops accordingly. That is
  the one number this round could not observe, because the sandbox has no key.
- Run the ExamSide adapter end to end; the official-archive path is the one
  exercised here.
