# Part 4 — DPP Engine

Matches PROJECT_PLAN.md's Part 4 file list exactly. Drop these paths into
the existing `gate-ai/` repo (they assume Parts 1–3 are already in place).

```
prisma/schema.part4.additions.prisma   → merge into prisma/schema.prisma,
                                          then `npx prisma migrate dev`
server/domains/dpp/
├── dpp.config.ts     configurable source proportions (default 4/3/3/3/4/3 = 20)
├── dpp.types.ts       shared types
├── dpp.compose.ts     pure composer — no I/O, fully unit-testable
├── dpp.service.ts     candidate-source Prisma queries + idempotent
│                       generateTodaysDPP()
└── dpp.test.ts         12 unit tests on the composer (proportions,
                         no-duplicates, backfill, shortfall reporting)
app/practice/dpp/page.tsx      today's DPP — instrument-panel list, priority
                                spine per item, per DESIGN_SYSTEM.md
app/api/dpp/generate/route.ts  POST, idempotent per (user, day)
tests/integration/
├── fakeDb.ts                   in-memory Prisma-shaped fake used only by tests
└── dpp-generation.test.ts      5 tests: full pipeline, idempotency, per-day
                                 isolation, attempted-question exclusion,
                                 graceful degradation on a sparse bank
server/db/client.ts             placeholder Prisma singleton — delete this
                                 if Part 1 already provides the real one
```

## Design system

`app/practice/dpp/page.tsx` is built against **design.md / dashboard-demo.html**
(the current, canonical system) — full-bleed `#F8F6F2` surface, Inter,
white `rounded-[20px]` panels with `#E3E0DA` hairline borders, `#0E8074`
teal reserved for positive/progress, `#D98E2B` amber reserved for
attention/urgent/weak. It intentionally does **not** use the earlier
dark-navy "Drafting Table" tokens or the `PriorityBar` component built
under that system — colors are the literal hex values, matching how
`dashboard-demo.html` itself is written, so this page reads as the same
product as the dashboard rather than a different app bolted on. Concretely:

- Header meta/heading pairing, progress bar (`animate-fill-w`, teal fill),
  and the question-list panel all reuse the exact classes the dashboard
  uses for its "Memory Management — concepts" panel and continue-learning
  cards.
- `WEAK` / `MISTAKE` / `REVISION` source labels render in amber (they're
  the "needs attention" buckets); `PREREQUISITE` / `PYQ` / `MIXED` stay in
  neutral slate — nothing here is amber or teal for decoration.
- Per-question status (`Correct` / `Incorrect` / `Not attempted`) uses the
  same three-color logic as the rest of the app: teal for good, amber for
  wrong, slate-light for neutral/pending.

## Design decisions worth knowing

- **Pure composer, impure fetcher.** `dpp.compose.ts` has zero imports from
  Prisma or Next — it just turns six candidate arrays into one ordered,
  deduplicated list. That's what makes `dpp.test.ts` runnable with no
  database. `dpp.service.ts` does all the actual querying and is the only
  file that talks to Prisma.
- **Dedup is global, not per-bucket.** A question surfaced by both `WEAK`
  and `REVISION` (a weak concept that's also due) is only placed once —
  first bucket to claim it wins, per `DPP_SOURCES` order.
- **Backfill is honest about attribution.** If `REVISION` comes up short
  (nothing due today, which is normal) its slots are filled from
  `config.backfillOrder` and tagged `MIXED`, not silently relabeled as
  `REVISION` — the "why is this here" UI should never lie about a
  question's source.
- **Idempotent per (userId, date).** `DPP.userId_date` is a unique
  constraint; `generateTodaysDPP` checks it first and returns the existing
  set unchanged on a second call, so reloading the practice page never
  reshuffles a set the student already started.
- **All 17 tests pass as-is** — verified in a scratch Vitest project
  during authoring (12 in `dpp.test.ts`, 5 in
  `tests/integration/dpp-generation.test.ts`). The integration test mocks
  only `@/server/db/client`; `dpp.service.ts`'s `import type { PrismaClient }`
  is type-only and erased at transpile time, so nothing about
  `@prisma/client` needs to be installed for these tests to run.

## Assumed from Parts 1–3

`ConceptStats(userId, conceptId, mastery, nextReviewAt)`,
`ConceptDependency(conceptId, prerequisiteConceptId)`,
`Mistake(userId, conceptId, createdAt)`, a `Question` ↔ `Concept`
many-to-many via `QuestionConcept`, and `Attempt(userId, questionId)`. If
any field name differs in your actual Part 1–3 schema, the only files that
need adjusting are the query functions in `dpp.service.ts` — `dpp.compose.ts`
and its tests are schema-agnostic.
