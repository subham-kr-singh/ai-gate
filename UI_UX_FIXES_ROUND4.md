# UI/UX Audit — Round 4 (accessibility, release scoping, motion stability)

Fourth pass against `DESIGN.md` (canonical per `dashboard-demo-v3.html`). Where
Round 3 worked through the review-queue state machine, this round audits the
things that only show up when the app is actually driven: keyboard and screen
reader behaviour, layout stability while a page fills in, and the release/unit
filter once more than one release is in the database.

Every item below was reproduced against the running production build
(`next start`) before being fixed, and re-checked after.

## What was wrong and what changed

### 1. The mobile drawer was visually modal but not actually modal

`MobileNav`'s slide-out drawer dimmed the page and locked `body` scroll, but
kept none of the keyboard contract a modal needs. Reproduced at a 390px
viewport:

- the panel had no `role="dialog"`, no `aria-modal`, and no accessible name
  beyond the inner `<nav aria-label>` — so a screen reader had no signal that a
  modal had opened or what it was;
- focus was never moved into the panel on open, so a keyboard user was left
  behind the overlay with no visible ring;
- **Tab walked straight out of the drawer** into the page underneath. The page
  was still on screen and still focusable, so the "modal" leaked about a dozen
  invisible-but-reachable controls;
- wrapping was **asymmetric**: the trap pulled focus back in when focus had
  escaped and the user pressed Shift+Tab, but not when they pressed Tab, so
  "pull it back in" only worked half the time;
- on close, focus was not returned to the hamburger, dumping the user back at
  the top of the document.

`DESIGN.md` §5 asks for real, not decorative, affordances, and architecture
§85 lists accessible dialogs and keyboard navigation as requirements.

The fix traps focus inside the panel, wraps at both ends, pulls focus back in
if it escapes, restores it to the trigger on close, and adds the dialog
semantics. The `role="dialog"` sits on the **overlay wrapper**, not the
`<nav>`: putting it on the `<nav>` would replace that element's navigation
landmark role and cost the drawer its "All destinations" landmark.

Verified with real key presses in Playwright at 390×844 against `next start`:

```
drawer open:                              true
aria-expanded:                            true
focus moved into panel:                   true
focusable count:                          9
escaped during forward tabbing (14 Tabs): false
escaped during backward tabbing:          false
closed after Escape:                      true
focus returned to trigger:                true
page errors:                              none
```

### 2. Two releases printing the same section number were indistinguishable

`listStagedUnits` groups by release, but the `<select>` rendered only
`{sourceUnitId} · {label}`. With both `gatecse-2026` and an earlier release
staged, section `2.2` appeared as two byte-identical rows and the reviewer had
to guess which release they were picking.

The release is now appended, but **only when it is needed** — a new
`ambiguousUnits` memo counts occurrences of each `sourceUnitId` across the
option list and the release tag is shown only for ids that appear more than
once. A single-release queue reads exactly as before.

Verified against the live queue (one release staged, so no suffix — correct):

```
- All units
- volume1:2.2 · Degree of Graph (1 staged)
- volume1:2.4 · Graph Connectivity (1 staged, 1 ready)
- volume2:1.2 · Algorithm Design Technique (2 staged, 2 ready)
```

### 3. The detected-session skeleton did not match the card it replaced

`DetectedSessions` swapped a plain `h-28` grey block for a card of a different
height, so the rows below jumped when the fetch resolved. Measured CLS on
`/study-report` was **0.0557** — inside the "good" band, so this was polish
rather than a fix, but it is exactly the kind of visible settle the request
asked to eliminate.

The skeleton now mirrors the real card's markup: same `ui.card` class, same
`p-5`, and two text-width bars standing in for the header row and the accuracy
line. CLS dropped to **0.0394**, and everything else on the page was already
`0.0000`.

## Verification

### Page-by-page, four viewports

All 11 authenticated destinations at 390 / 768 / 1440 / 1920px — **44
combinations**, every one clean:

- no horizontal overflow (`scrollWidth ≤ innerWidth`) on any page at any width;
- no console errors and no page errors.

### Layout stability and hydration

Cumulative Layout Shift per page, with a `layout-shift` PerformanceObserver and
a hydration-error console listener:

```
/dashboard      0.0000  clean      /mistakes       0.0000  clean
/planner        0.0000  clean      /flashcards     0.0000  clean
/syllabus       0.0000  clean      /reports        0.0000  clean
/practice       0.0000  clean      /review         0.0000  clean
/tests          0.0000  clean      /study-report   0.0394  clean
/mocks          0.0000  clean      drawer open/close 0.0000
```

No "text content did not match" or hydration warnings anywhere.

### Keyboard and focus

108 tab stops across five pages, advanced with **real Tab presses** (not
programmatic `.focus()`, which does not trigger `:focus-visible` — see the
AGENTS.md note on this false positive):

```
checked 108 tab stops, missing ring: 0
```

Keyboard-only operation of the review queue also works: the unit `<select>` is
focusable, ArrowDown changes the filter, and Enter on a draft row opens its
detail pane.

### Colour is never the only channel

Contrast was computed for every DESIGN.md token pair. Three are below AA for
small text — `slate-light #9B968E` (2.72 on surface), `amber #D98E2B` (2.48),
and `slate #77736D` at 4.36 — but these are the canonical palette values and
DESIGN.md §8 says to port them, not re-derive them, so they were **left
alone**. What §85 requires ("colour should not be the only information
channel") was instead confirmed across every status indicator: each one carries
words alongside its tint —

| Signal | Colour | Text with it |
| --- | --- | --- |
| Draft status dot | teal / amber / slate | "Approved" / "Flagged" / "Already decided" |
| Answer correctness | teal / amber | "Correct" / "Incorrect" |
| Mistake state | amber / teal | "Not tagged yet" / ", resolved" |
| Pace | teal / amber | "On track" / "Needs attention" / "Behind pace" |
| Due counts | amber / slate | the number itself, plus "Due for review" |
| Stat deltas | teal / amber | the signed delta |

The status dot is the one purely colour-coded glyph, and it is `aria-hidden`
beside a text label, so it is redundant by construction.

### Motion

The only animations in the codebase are the two sanctioned ones plus skeletons:
`animate-fill-w` (progress bars, DESIGN.md §6) and `animate-pulse` (loading).
There is no `hover-lift`, no `transition-transform`, no `hover:scale`. The
`prefers-reduced-motion` block in `globals.css` neutralises both, along with
all transitions and smooth scrolling.

## Pre-existing state, unchanged

- `/` redirects to `/dashboard` for a signed-in session (307) — intended.
- The source `<select>` on `/review` renders only when `adapters.length > 2`;
  with a single adapter staged it is correctly hidden.
- The `[job]` catch-all cron route serves all three paths in `vercel.json`
  (`daily`, `weekly`, `resources`), so the config and the code agree. Confirmed
  live: unauthenticated → 401, unknown job with the secret → 404, and the
  `resources` job ran to completion (10 URLs attempted, 10 stored, 0 failed).

## Deployment

`npm run vercel-build` (`prisma generate && prisma migrate deploy && next
build`) passes end to end: 9 migrations found, none pending, compiled
successfully. No new dependencies were added, and none of the changes touch the
serverless boundary — the ingestion and review pages are `force-dynamic`
client-driven reads, and the long-running unit import stays a CLI command by
design (`/api/ingestion/gopdfs/units` is read-only and returns the exact
command to run instead of importing inside a request).

## Files changed

| File | Change |
| --- | --- |
| `components/shell/MobileNav.tsx` | dialog semantics, focus trap, focus restore |
| `components/review/ReviewQueue.tsx` | disambiguate same-section units across releases |
| `components/study/DetectedSessions.tsx` | skeleton matches card geometry |
| `server/domains/questions/question.repository.ts` | make the import upsert idempotent **and** correct |
| `tests/integration/question-import.test.ts` | pins that upsert contract (new) |

### The import upsert, found by the failing integration test

The full suite failed on `tests/integration/quiz-mastery.test.ts`, and stashing
the repository change made it pass — so the regression was mine, not pre-existing.

`upsertByContentHash` was passing `data` (including `concepts`) as the Prisma
`update` payload. Prisma turns a nested `create` under `update` into a plain
INSERT, and `QuestionConcept` is unique on `(questionId, conceptId)`, so a second
import of the same question threw instead of being the no-op the scripts promise.
The first fix — dropping `concepts` from the update — silenced the error but was
wrong the other way: it left the concept links stale.

The failure it caused is worth spelling out, because it is why the test caught
it. `contentHash` covers only statement, type and correctAnswer; it does **not**
cover subject or concepts. `quiz-mastery.test.ts` imports a fixed statement, and
a leftover row from an earlier run already held that hash pointing at *different*
concepts. With `concepts` dropped from the update, the quiz's question never got
its concept link, so `ConceptStats` was never written and mastery stayed null.

The upsert now reconciles links explicitly: upsert the scalars, diff the desired
concept ids against the rows actually held, delete the extras and `createMany`
(`skipDuplicates`) the missing ones. Idempotent, and it re-points links when the
hash matches a row carrying different concepts.

`question-import.test.ts` pins this: import once, import again (no unique
violation, no duplicate link), and confirm a scalar update still lands. Run
against the un-fixed repository it fails two of three cases.

(The release-scoping fix, its integration tests and the GO-PDFs import doc were
committed separately in `c32bc57` and the commits before it. The upsert fix is
included here because the same audit run is what exposed it.)

## Checks

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `eslint .` | clean |
| `vitest run` (unit) | 331 passed, 4 skipped (335) |
| `vitest run` (with `RUN_INTEGRATION_TESTS=1`) | 331 passed, 4 skipped (335) |
| `next build` | compiled, 28 routes |
| `prisma migrate status` | 9 migrations found, up to date |
| live API sweep (`qa-api.js`, 27 routes) | 0 failures |
| page sweep, 12 destinations | all 200, 0 error markers |
| mock assembly against the filled bank | 65 questions / 100 marks, reproducible |
