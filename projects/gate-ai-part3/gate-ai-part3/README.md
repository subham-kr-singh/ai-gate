# GATE AI - Part 3: Learning State

Mastery, mistakes, coverage, unit completion, revision queue, the Quick Study
Report, and the dashboard/mistake-notebook UI on the new light design
(`design.md` / `dashboard-demo.html`).

This is an **overlay**: unzip it into the repo root (`gate-ai/`). It adds files and
replaces only `app/dashboard/page.tsx` (back up the Part 1 demo first).

## Install

1. Unzip into the repo root.
2. Append `prisma/part3.schema.prisma` to `prisma/schema.prisma`, then
   `npx prisma migrate dev --name part3_learning_state`.
3. If `app/globals.css` does not already have it (design.md section 6), add:
   ```css
   @keyframes fillbar { from { width: 0%; } }
   .animate-fill-w { animation: fillbar 900ms cubic-bezier(0.22,1,0.36,1) forwards; }
   @media (prefers-reduced-motion: reduce) { .animate-fill-w { animation: none; } }
   ```
4. `npx vitest run` (3 files, 36 tests; no database needed).
5. Wire the Part 2 hook below.

## The one hook you must add (Part 2)

After the submit route grades a test/quiz and saves the answers, call:

```ts
import { recordAnswers } from "@/server/domains/mastery/mastery.service";

await recordAnswers(user.id, gradedAnswers.map((a) => ({
  answerId: a.id,              // Answer.id - makes retries idempotent
  questionId: a.questionId,
  correct: a.correct,          // from grading.service
  isPyq: question.source === "PYQ",   // adapt to your Question fields
  timeMs: a.timeTaken,
  confidence: a.confidence,    // 1-4 or null
})));
```
Pass **answered** questions only. Calling it twice for the same answer is a no-op.
For each answer it updates ConceptStats/TopicStats (EMA v1), the review ladder,
creates an untagged Mistake for wrong answers, and recomputes the unit's
LearningState.

## What is where

| Area | Files |
|---|---|
| Pure logic (tested) | `server/domains/mastery/{mastery.config,mastery.math,completion.config,completion.service,study-report.schema}.ts`, `server/domains/revision/revision.schedule.ts`, `server/domains/mistakes/mistake.types.ts` |
| Database orchestration | `mastery.service.ts` (`recordAnswers`, `recomputeUnitState`), `study-report.service.ts`, `mastery.repository.ts`, `mastery.queries.ts`, `revision.service.ts`, `mistake.{repository,service}.ts`, `analytics.service.ts` |
| Part 1/2 reads (one adapter) | `server/domains/syllabus/syllabus.lookup.ts` |
| API | `app/api/mistakes/route.ts` (GET list, POST tag/resolve), `app/api/study-reports/route.ts` (POST) |
| UI | `app/dashboard`, `app/mistakes`, `app/study-report`, `components/{shell,dashboard,mistakes,study}`, `lib/{ui-tokens,status,reason-text}.ts` |
| Tests | `tests/unit/{mastery,completion,study-report}.test.ts` |

## Behaviour worth knowing

- Reported coverage (`StudentCoverage`) and validated state (`LearningState`) are separate. "I finished Unit 2" never proves mastery.
- Study-report questions count at `selfReportWeight` (0.5) and never touch app-verified `attempts/correct`.
- Unit status comes from `evaluateUnitCompletion` (coverage, mastery, practice/PYQ accuracy, recent accuracy, open mistakes, prerequisite gaps). No fixed 90/87/82 thresholds; every cut-point is in `completion.config.ts` and versioned. The numbers are starting points, not calibrated values.
- A wrong answer creates an untagged Mistake. A later correct answer to the same question resolves it (unless confidence was 1, a guess).
- Prerequisite locks in the concept list are display only; nothing is blocked.

## Assumptions about Part 1/2 (check these first)

I could not see the Part 1/2 code. All schema reads are in `syllabus.lookup.ts`:
- Models `Subject > Unit > Topic > Concept` with relations `unit.subject`, `unit.topics`, `topic.unit`, `concept.topic`, and FKs `subjectId`, `unitId`, `topicId`.
- `QuestionConcept { questionId, conceptId }`, `ConceptDependency { conceptId, prerequisiteId }`.
- Names read from `name`/`title`/`label`; order from `order`/`position`/`sortOrder`.
- `import { prisma } from "@/server/db/client"` and `getCurrentUser()` from `@/server/auth/session` returning `{ id, email, name? } | null`.
- `zod` and `next` are installed (both are in the plan).
- Part 3 tables reference Part 1/2 rows by plain string id (no `@relation`), so you do not need to edit existing models.

## Verification status

- Ran: 36 unit tests (EMA, retention, batch evidence, completion evaluator, revision ladder, report schema) and a strict `tsc` over the whole overlay with the session/db modules stubbed.
- Not run: anything against a real database. `prisma generate` could not download engines in my sandbox, so the Prisma queries were type-checked only as `any`. Run `npx tsc --noEmit` in your repo after migrating; mismatches with your Part 1/2 field names will show there.

## Design notes

- Values come from `design.md`; `lib/ui-tokens.ts` holds them as literal Tailwind classes. Move them to `tailwind.config.ts` when you port the palette.
- Not built here because their data arrives later: the exam-week strip and days-to-exam (Part 5), the Mocks tile (Part 6), and DPP progress (Part 4). The third tile shows open mistakes instead.
- Amber `#D98E2B` on the cream surface is about 2.5:1 contrast. Every amber figure here also has a text label, but consider a darker amber for small text.
- `app/study-report` is not in PROJECT_PLAN.md; I added it because the "+ Log study session" button needs a target.
