# GATE AI — Part 5: Planner

Priority engine, exam countdown and phases, adaptive planner, personal velocity, FSRS flashcards,
pace and progress reports, daily and weekly jobs. Built to `PROJECT_PLAN.md` (Part 5) and the
canonical `design.md` (light surface, Inter, pastel tiles, teal and amber signals).

The LLM appears nowhere in this Part. Every recommendation is a deterministic function of your
evidence, the phase and the time, so it can be replayed, tested and explained.

## Install

1. Copy the folders in this zip into the repo root (they merge with `app/`, `components/`, `server/`, `tests/`, `.github/`).
2. Append `prisma/part5.schema.prisma` to `prisma/schema.prisma`, then:
   ```bash
   npx prisma migrate dev --name part5_planner
   ```
   The new models use plain string ids for `userId`, `unitId` and `conceptId`, so nothing in
   User, Unit or Concept has to change.
3. Merge `vercel.json` (two crons) and add `CRON_SECRET=<long random string>` to `.env` and to Vercel.
4. Add these GitHub secrets for `backup.yml`: `DIRECT_URL`, `BACKUP_PASSPHRASE`, `B2_ENDPOINT`,
   `B2_BUCKET`, `B2_KEY_ID`, `B2_APP_KEY`. Run it once with **restore_test** ticked; a backup you have not restored is not a backup.
5. `npm run dev`, open `/planner`, set your exam date. Everything else follows from that.
6. Load the question bank: `npm run seed`, then
   `npm run import:gateoverflow -- --source go-pdfs-json --write` (see
   [Question import](#question-import-gate-overflow)).

No new npm packages: `ts-fsrs`, `zod` and `date-fns` are already in the Part 0 `package.json`.

## Routes

| Route | What it does |
|---|---|
| `/planner` | Today: next action, reasons, override, phase track, pace |
| `/flashcards` | FSRS review queue and add-card form |
| `/reports` | Am I on track, why progress slowed, latest weekly review |
| `GET /api/planner/today` | Next best action (idempotent) |
| `POST /api/planner/override` | follow, override, skip or snooze |
| `GET/PUT /api/planner/plan` | exam date, preparation start, soft pace targets |
| `GET/POST /api/flashcards`, `POST /api/flashcards/:id/review` | queue, create, rate |
| `GET /api/cron/daily`, `/api/cron/weekly` | Vercel Cron, bearer `CRON_SECRET` |
| `GET /api/cron/questions` | Vercel Cron, weekly: import the latest GATE Overflow corpus |
| `GET/POST /api/ingestion` | Which sources exist, bank size, run history; run an import |

Point the nav rail at these: Today is `/planner`, and Flashcards and Reports get their own icons.

## Question import (GATE Overflow)

The question bank is filled from GATE Overflow's public corpus rather than hand-authored.
Two sources are configured; both parse to the same shape and run through the same Zod
validation every other writer uses.

```bash
npm run import:gateoverflow                                # dry run, official HTML source
npm run import:gateoverflow -- --write                     # import it
npm run import:gateoverflow -- --source go-pdfs-json --write
```

| Source | Content | Best for |
|---|---|---|
| `go-pdfs-html` | `GATEOverflow/GO-PDFs` release `book_filter6.html` | Official repo, published answer keys |
| `go-pdfs-json` | `Mr-Nobody003/GATE` `data/formatted_all.json` | GATE CSE coverage, per-topic placement, NAT/MSQ |

The JSON mirror is the better corpus in practice: it yields ~3,080 importable questions with
per-concept placement against ~1,100 for the HTML, because it carries GATE CSE volumes plus a
subtopic label on every question, whereas the HTML book is UGC-NET-weighted and chapter-level
only. It is community-maintained with no licence file, so the official HTML remains the default
for provenance; pass `--source go-pdfs-json` to use the mirror.

Both are idempotent: the raw bytes are hashed, an unchanged corpus is a no-op, and a changed one
updates existing rows in place by `contentHash`. Every run is recorded in `SourceIngestion` with
what it imported, where it landed per unit, and why anything was skipped.

GATE Overflow content is community-contributed and the repos carry no licence. This is treated as
personal-use ingestion of publicly published material, and each imported question stores its
`source`, `sourceUrl` and `license` for attribution. Do not redistribute it without GATE
Overflow's permission.

## Adapter points (read this before the first build)

Part 5 reads tables written by Parts 1 to 4. I could not see your generated schema, so the field
names below come from `GATE_AI_ARCHITECTURE` sections 18, 24 and 70 to 72. **All of them are read in one file,
`server/domains/planner/planner.repository.ts`**. If `tsc` complains, that is the only place to fix.

| Assumed | Used for |
|---|---|
| `Unit { id, name, order, subject { id, name, order }, topics { order, concepts { id, name, order } } }` | syllabus order, Master Plan |
| `ConceptStats { userId, conceptId, mastery, retention, completion, attempts, correct, mistakes, pyqAttempts, pyqCorrect, lastSeen, nextReviewAt }` | mastery, accuracy, revision due |
| `StudentCoverage { userId, unitId, status, coveragePct }` | reported coverage |
| `Answer { userId, correct, createdAt, question { unitId } }` | recent accuracy (14 days) |
| `Mistake { userId, unitId, resolvedAt }` | open mistakes |
| `ConceptDependency { conceptId, prerequisiteId }` | prerequisite gaps |
| `Question { unitId, marks, year, status }` | marks-weighted importance |
| `@/server/db/client` exports `prisma`; `@/server/auth/session` exports `requireUserId()` | data access, auth |

The daily job also runs one raw SQL `UPDATE "ConceptStats"` for retention, so it needs those table
and column names as Prisma generates them.

## How a recommendation is made

1. **Master Plan.** One `PlanItem` per unit in syllabus order, each with a soft target duration and a maximum extension.
2. **Adaptive Plan.** Each unit is re-judged against evidence. `ACTIVE` moves to `PROVISIONALLY_COMPLETE` only when readiness clears the bar,
   or to `GOOD_ENOUGH` at target plus maximum extension, with its weak concepts owed to revision. Reported coverage with too few
   answers is `UNVERIFIED`, and the planner asks for a check quiz instead of trusting the label.
3. **Priority.** `weakness + marks importance + remaining syllabus + prerequisites + mistakes + revision urgency + recent performance`,
   weighted per phase. Performance is shrunk toward 50% when attempts are few.
4. **Today's target.** Candidate actions are scored; the top one is shown with machine-readable reasons, and the rest are alternatives.
   A weak prerequisite is repaired before harder questions. Moving on records the weakness as revision owed, never as resolved.

All tunable numbers are in `planner.config.ts`, with `*_VERSION` constants. Bump the matching version when a change alters
recommendations. Each `PlannerDecision` stores the versions and the target unit's state before the intervention.

Defaults worth knowing: phases are 30 / 25 / 25 / 20 percent of the time between `prepStartDate` and the exam (or explicit dates);
unit pace is seeded from "about a unit a day, hard units two to three" and replaced by your observed velocity; marks importance uses an
approximate per-subject table until your PYQ bank holds 150 marks, then switches to the bank.

## Design alignment

Pages use the values in `design.md` exactly (surface `#F8F6F2`, ink `#111111`, teal for progress, amber for weak or due, pastel tiles,
20 to 24px radii, pill controls, hairline column dividers). They render the main workspace and the 320px panel; the 76px rail comes from your layout.
Hex values are Tailwind arbitrary values inside the Part 5 components, so nothing depends on your `tailwind.config.ts`.
When you port the palette into the config (design.md section 8), search for `#` in `components/planner`, `components/flashcards` and `app/planner|reports|flashcards`. Part 1's layout still loads Archivo and IBM Plex Sans;
`design.md` says Inter.

## Wiring left for other Parts

- **Part 4 (DPP):** in `app/api/cron/[job]/route.ts`, pass `hooks.prepareDpp` so the daily job prepares tomorrow's set.
- **Part 6 (mocks):** call `recordMockCompleted(userId)` from `planner.service.ts` when a mock is submitted, so the planner can pace the next one.
- **Recommendation evaluation:** `PlannerDecision.outcome` is stored empty. Fill it from fresh unseen questions, PYQs and mocks, not from the mastery number.

## Tests

`tests/unit/priority.test.ts` and `planner.test.ts` (Vitest) cover weights, shrinkage, phases, the exit rule, transitions,
candidate selection, overrides pinning, the revision ladder, velocity, pace, the weekly comparison and the signals builder.
The 50 tests exercise the pure core only; the repository and routes need your database.
FSRS mapping (`fsrs.service.ts`) has no test here because it needs `ts-fsrs` installed.
