# GATE AI

Personal adaptive GATE CSE/IT preparation engine. See
`docs/GATE_AI_ARCHITECTURE.md` for the full product/architecture
rationale and `PROJECT_PLAN.md` (repo root, outside this scaffold) for
the part-by-part build order this code follows.

**Current scope: Part 1 (foundation) + Part 2 (question bank, test
engine, deterministic GATE grading).** No AI, no mastery/DPP/planner
yet — those are Parts 3–7.

## Setup

```bash
npm install
cp .env.example .env        # fill DATABASE_URL, DIRECT_URL, AUTH_SECRET, ALLOWED_EMAILS
npx prisma generate
npx prisma migrate dev --name init
npm run seed                 # loads the 55-unit + General Aptitude syllabus
npm run dev
```

Add at least one question before taking a quiz — either hand-write a
JSON file matching `server/domains/questions/question.schema.ts` and run:

```bash
npm run import:questions -- ./path/to/questions.json
```

or seed a small local dev sample via `prisma/seed/questions.data.ts`.

## Testing

```bash
npm test                                  # unit tests (grading, syllabus matching) — no DB needed
RUN_INTEGRATION_TESTS=1 npm test -- tests/integration   # needs a migrated + seeded local DB
npx playwright test tests/e2e             # e2e — install @playwright/test first
```

## What's authoritative where

- **PostgreSQL is the source of truth** for grading, marks, mastery
  (Part 3+), and attempt history. Nothing in this codebase computes a
  score outside `server/domains/grading/grading.service.ts`.
- **Attempts and Answers are append-only.** Submitting a test writes one
  immutable record; nothing rewrites historical rows when algorithms
  change later.
- **Autosave is seq-guarded** (`Test.draftAnswers`) so a stale/duplicate
  request from a flaky phone connection can never overwrite a newer
  answer.

## Folder map

See `PROJECT_PLAN.md` for the authoritative, part-by-part file listing.
Short version:

```
prisma/            schema + seed data (syllabus, marking schemes)
server/domains/     domain services — grading, tests, questions, attempts,
                    syllabus. HTTP-independent, unit-testable.
app/api/            thin route handlers — validate → call a domain
                    service → respond. No business logic here.
app/                pages (server components by default; test-taking UI
                    is a client component for autosave/timer state)
components/         ui/ (generic) and test/ (test-taking specific)
```
