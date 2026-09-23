# Dashboard UI/UX Audit — Findings and Fixes

Audit of the dashboard against the canonical `DESIGN.md` and `dashboard-demo.html`,
plus an end-to-end QA pass over every route. Everything below was reproduced in a
running app before being changed, and re-verified after.

Scope of this pass: the dashboard's metrics, its subject/range filter, and the
stat-tile row. The broader design-system audit (save confirmations, palette
tightening, 404 handling) landed separately in `fix/ui-ux-design-system-audit`.

## 1. "Questions this week" contradicted the chart

The dashboard's headline tile and its activity chart reported the same metric
from two different tables:

| Surface | Source | Value shown |
| --- | --- | --- |
| Activity chart + Attempted tile | `Answer` / `DPPQuestion` rows | 40 |
| "Questions this week" tile | `AppliedOutcome` rows | 0 |

So a student who had clearly practiced saw a chart full of bars next to a tile
reading zero. `AppliedOutcome` rows are written by the mastery pipeline, not by
the practice flow itself, so the tile lagged whenever that pipeline had not run.

Fix: the tile now reads `series.totalAttempted`, the exact value the chart is
drawn from, and its note reads "N today" instead of the misleading
"0 in the last 24 hours". The two can no longer disagree, because there is only
one number.

## 2. The chart ignored the subject filter

Selecting a subject scoped the tiles and the "Continue learning" list but left
the chart showing all-subject bars — a filtered panel that still displayed
unfiltered data.

Fix: `getActivitySeries` takes an optional `subjectId` and applies it in SQL
(joining `Answer → Question → Unit.subjectId`, and the same on `DPPQuestion`),
and the activity API accepts `?subject=`. Filtering happens in the query rather
than after bucketing, so the bar heights are genuinely subject-scoped.

The id is validated against `Subject` before it reaches a query, so an arbitrary
string cannot be used to probe the data. A non-existent subject falls back to
the unscoped series instead of erroring.

Verified with a second subject seeded into the database:

```
no filter                          total 45
subject=Discrete & Engineering Math total 40
subject=<second subject>            total  5
```

The chart is also refetched with the subject applied when the range toggle
requests the 30-day series, so switching to Monthly mid-filter stays consistent.

## 3. Duplicate "Log study session" call to action

Two identical buttons rendered on one screen — one closing the Exam-week strip,
one in the sidebar — both linking to `/study-report`.

Fix: the panel copy was removed; the sidebar owns the action. One primary CTA
per view.

## 4. Third stat tile did not match the design system

`DESIGN.md` defines the tile row as Butter / Sky / Lavender and assigns the
third to **Mocks completed**. The app was rendering an "Open mistakes" tile in
Lavender instead, so the row deviated from the documented palette and skipped a
metric the design called for.

Fix: the third tile is now **Mocks completed**, fed by a new
`Overview.mocksCompleted` (`MockTest` rows with status `SUBMITTED`) and
`mocksTarget` from `PLANNER_CONFIG.actions.mockTarget` (8). Its note reads
"Target 8 · behind pace" / "on pace", with the amber `#D98E2B` reserved for the
attention state only, as `DESIGN.md` §2 requires.

## 5. Dead heading computation removed

`app/dashboard/page.tsx` still computed `heading` and `sub` strings and a
`n = overview.weakConceptCount` binding whose only consumer had already been
replaced by the new panel. Removed, along with the now-unused imports.

## Accessibility and interaction notes

Reviewed, no changes needed:

- The chart's SVG is `role="presentation"` / `aria-hidden`, and the real data
  lives in an adjacent per-day button row with `sr-only` text
  ("Wed 16: 3 attempted, 2 correct"). Reachable by mouse, touch, and keyboard.
- Daily hit targets are full-height rectangles, so a 2px bar is still hoverable.
- Blueprint colours come from a single `COLORS` object shared with the tiles.
- The Daily → Weekly → Monthly control is URL-driven, so filtered views are
  shareable and survive refresh.

## Verification

| Check | Result |
| --- | --- |
| `tsc --noEmit` | pass |
| `eslint .` | pass |
| `vitest` | 197 passed, 16 skipped |
| `next build` | pass |
| Route sweep (`/dashboard`, `/planner`, `/syllabus`, `/practice`, `/tests`, `/mocks`, `/mistakes`, `/flashcards`, `/reports`, `/study-report`, `/tutor`) | all 200 |
| Server error log | empty |
| `/api/dashboard/activity?days=7` | 200, correct series |
| Bogus `?subject=` | falls back to unscoped, no error |

The temporary QA seed/cleanup scripts and all seeded rows were removed; the
database was returned to its prior state and no fixture files are committed.

## Not changed

- `prisma/schema.prisma` — no migration needed; the new mock count uses an
  existing model and index.
- `vercel.json` — cron schedules (`/api/cron/daily`, `/api/cron/weekly`,
  `/api/cron/resources`) are intact and were not touched.
- The auto-detected study-session feature was already merged on `main` and was
  not modified here.
