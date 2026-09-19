# GATE AI — Full Project Plan & Folder Map

This document is the single source of truth for **what gets built, in what
order, and where it lives in the repo**. It matches the phased scope in
`GATE_AI_ARCHITECTURE_UPDATED_V1.md` (Phase A / B / C) mapped onto 7 buildable
Parts. Every folder that already exists in this scaffold is listed with its
purpose and the exact files it will hold, tagged with the Part that creates
it.

Legend: `✅ scaffolded` = folder exists now (empty/placeholder). `🔜 Part N`
= files get written during that part.

**Design system:** see `DESIGN_SYSTEM.md` — a dark-navy + teal/amber
"drafting table" system built specifically for this app (not a generic
SaaS-card or warm-cream-serif template), following the frontend-design
skill's plan → critique → build process. Tokens live in
`tailwind.config.ts` / `app/globals.css`; the priority-spine and
mastery-ring components below are its concrete, non-generic UI devices.
Every UI file built from Part 1 onward uses these tokens — no ad-hoc hex
values in component code.

---

## 0. Setup (done once, before Part 1)

Base tooling — Next.js (App Router) + TypeScript + Tailwind + Prisma + the
standard recommended packages.

```
gate-ai/
├── package.json              ✅ dependencies: next, react, prisma, zod,
│                                 zustand, @tanstack/react-query, tailwind,
│                                 lucide-react, date-fns, vitest, tsx
├── tsconfig.json             🔜 strict TS config, path aliases (@/*)
├── next.config.js            🔜 minimal, typed
├── tailwind.config.ts        ✅ Drafting Table design tokens (see
│                                 DESIGN_SYSTEM.md) — colors, fonts, radius,
│                                 the ring-fill keyframe
├── postcss.config.js         🔜
├── .eslintrc.json            🔜 next/core-web-vitals
├── .env.example              🔜 DATABASE_URL, DIRECT_URL, AUTH_SECRET,
│                                 ALLOWED_EMAILS, LLM_API_KEY (Part 7 only)
├── .gitignore                🔜
└── README.md                 🔜 setup + run instructions
```

**Command sequence for setup:**
```bash
npm install
cp .env.example .env        # fill DATABASE_URL etc.
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run dev
```

---

## Part 1 — Foundation (auth + canonical syllabus + shell UI)

No grading, no AI. Goal: log in, see the real syllabus tree.

```
prisma/
├── schema.prisma             🔜 Part 1  — Exam, Subject, Unit, Topic,
│                                 Concept, ConceptDependency, User,
│                                 SyllabusVersion (full schema written once,
│                                 used incrementally by every later part)
├── migrations/                ✅ scaffolded — created by `prisma migrate dev`
└── seed/
    ├── index.ts               🔜 Part 1 — seed entrypoint, calls syllabus
    ├── syllabus.data.ts       🔜 Part 1 — the 10-subject structure from
    │                                       syllabus_details.md, hand-encoded
    │                                       (Subject → Unit → Topic → Concept)
    └── general-aptitude.data.ts 🔜 Part 1 — GA section, same shape

server/
├── db/
│   └── client.ts              🔜 Part 1 — Prisma client singleton
├── auth/
│   ├── allowlist.ts           🔜 Part 1 — email allowlist check
│   └── session.ts             🔜 Part 1 — session helpers (cookie-based)
└── domains/
    └── syllabus/
        ├── syllabus.repository.ts  🔜 Part 1 — DB reads for tree
        ├── syllabus.service.ts     🔜 Part 1 — getTree(), resolveEntity()
        └── syllabus.types.ts       🔜 Part 1

app/
├── layout.tsx                 🔜 Part 1 — root layout, nav shell
├── globals.css                🔜 Part 1 — Tailwind base + tokens
├── page.tsx                   🔜 Part 1 — redirects to /dashboard or /login
├── (auth)/
│   └── login/
│       └── page.tsx            🔜 Part 1 — email allowlist login form
├── dashboard/
│   └── page.tsx                🔜 Part 1 — placeholder shell (real content
│                                             wired in Part 3/5)
├── syllabus/
│   ├── page.tsx                 🔜 Part 1 — subject list
│   └── [subjectId]/page.tsx     🔜 Part 1 — unit → topic → concept drill-down
└── api/
    ├── auth/
    │   └── route.ts             🔜 Part 1 — login/logout
    └── syllabus/
        └── route.ts             🔜 Part 1 — GET tree

components/
└── ui/                         — Button ✅, MasteryRing ✅, PriorityBar ✅,
                                  ProgressBar ✅ built already (see
                                  DESIGN_SYSTEM.md). 🔜 Part 1 remaining —
                                  Input, Divider, Table, Tree, Skeleton, all
                                  hand-rolled against the same tokens (no
                                  shadcn/external UI-kit dependency, so the
                                  priority-spine/ring devices stay unique to
                                  this app instead of reading as a template)

app/
├── layout.tsx                  ✅ Archivo + IBM Plex Sans via next/font
├── globals.css                 ✅ CSS variable tokens, dark-first, reduced-
│                                  motion + focus-visible handled globally
└── dashboard/page.tsx           ✅ Today-screen demo proving the design
                                   against real content (static data for
                                   now — Part 3/5 wire it to live queries)

lib/
├── cn.ts                       🔜 Part 1 — clsx + tailwind-merge helper
└── env.ts                      🔜 Part 1 — typed env var access

tests/unit/
└── syllabus.test.ts            🔜 Part 1 — tree resolution tests
```

**Done when:** `npm run dev`, log in via allowlisted email, browse the real
55-unit + GA syllabus tree.

---

## Part 2 — Question Bank + Test Engine + Grading

```
prisma/schema.prisma            🔜 Part 2 additions — Question, QuestionVersion,
                                    QuestionConcept, QuestionSource, Exam
                                    MarkingScheme, Test, TestQuestion, Attempt,
                                    Answer

prisma/seed/
└── questions.data.ts           🔜 Part 2 — seed script/loader for the
                                    ~1,000–1,500 trusted question set
                                    (imported from a CSV/JSON you supply —
                                    see scripts/import-questions.ts)

scripts/
└── import-questions.ts         🔜 Part 2 — CLI: reads a source file (CSV/
                                    JSON of PYQs with answer keys) → validates
                                    with Zod → upserts Questions by
                                    contentHash

server/domains/
├── questions/
│   ├── question.repository.ts  🔜 Part 2
│   ├── question.service.ts     🔜 Part 2 — search/filter by subject/unit/
│   │                                        topic/concept/difficulty/type
│   └── question.schema.ts      🔜 Part 2 — Zod schema, MCQ/MSQ/NAT variants
├── grading/
│   ├── marking-scheme.ts       🔜 Part 2 — per-exam-year MCQ/MSQ/NAT rules
│   ├── grading.service.ts      🔜 Part 2 — pure function: (question,
│   │                                        answer) → { correct, marks }
│   └── grading.test.ts         🔜 Part 2 — the critical-test-cases matrix
│                                            (correct/incorrect/unanswered/
│                                            negative marking, MSQ partial,
│                                            NAT tolerance)
├── tests/
│   ├── test.repository.ts      🔜 Part 2
│   ├── test.service.ts         🔜 Part 2 — start test, autosave answer
│   │                                        (seq-numbered, idempotent),
│   │                                        submit, resume
│   └── test.types.ts           🔜 Part 2
└── attempts/
    ├── attempt.repository.ts   🔜 Part 2 — append-only writes
    └── attempt.service.ts      🔜 Part 2 — recordAnswer(), attempt history

app/
├── practice/
│   └── [unitId]/page.tsx       🔜 Part 2 — topic quiz launcher
└── tests/
    ├── page.tsx                🔜 Part 2 — test list
    └── [testId]/
        ├── page.tsx             🔜 Part 2 — question navigation, palette,
        │                                     timer, mark-for-review, submit
        └── result/page.tsx      🔜 Part 2 — score + per-question review

app/api/
├── questions/route.ts          🔜 Part 2 — GET filtered question list
├── tests/
│   ├── route.ts                 🔜 Part 2 — POST create/start test
│   └── [id]/
│       ├── answer/route.ts       🔜 Part 2 — POST autosave (seq-guarded)
│       └── submit/route.ts       🔜 Part 2 — POST submit → grading →
│                                              attempt.service
└── attempts/route.ts            🔜 Part 2 — GET history

components/test/                 🔜 Part 2 — QuestionCard, Palette, Timer,
                                              OptionList, NATInput,
                                              SubmitConfirm

tests/integration/
└── test-submission.test.ts      🔜 Part 2 — full submit → grade → attempt
                                              pipeline

tests/e2e/
└── take-test.spec.ts            🔜 Part 2 — Playwright: login → quiz →
                                              submit → result
```

**Done when:** a topic quiz can be taken end-to-end with a trustworthy,
deterministic score and a saved attempt.

---

## Part 3 — Learning State (mastery, mistakes, coverage)

```
prisma/schema.prisma             🔜 Part 3 additions — Mistake,
                                     MistakeConcept, LearningState,
                                     ConceptStats, TopicStats, ReviewState,
                                     StudySession, StudySessionReport,
                                     StudentPlan, StudentCoverage

server/domains/
├── mastery/
│   ├── mastery.service.ts       🔜 Part 3 — EMA update (`masteryAlgorithm
│   │                                          Version = "v1"`), retention
│   │                                          approximation
│   ├── mastery.test.ts          🔜 Part 3 — EMA math unit tests
│   └── completion.service.ts    🔜 Part 3 — unit completion evaluator
│                                              (coverage + mastery + accuracy
│                                              + PYQ + mistakes + prereqs,
│                                              versioned + configurable)
├── mistakes/
│   ├── mistake.repository.ts    🔜 Part 3
│   └── mistake.service.ts       🔜 Part 3 — one-tap tag taxonomy
│                                              (CONCEPTUAL_GAP,
│                                              CALCULATION_ERROR, MISREAD,
│                                              FORMULA_RECALL,
│                                              CONFUSED_CONCEPTS,
│                                              CARELESS_ERROR, GUESS,
│                                              TIME_PRESSURE)
└── revision/
    └── revision.service.ts      🔜 Part 3 — review-due queue (pre-FSRS,
                                               simple interval; swapped for
                                               ts-fsrs in Part 5 flashcards)

app/
├── mistakes/
│   └── page.tsx                  🔜 Part 3 — mistake notebook, filter by
│                                              type/subject/unit
└── dashboard/
    └── page.tsx (updated)        🔜 Part 3 — wire in real weak-unit report

app/api/
├── mistakes/route.ts             🔜 Part 3 — GET/POST tags
└── study-reports/route.ts        🔜 Part 3 — POST manual Quick Study Report
                                                (subject, unit, status, topics
                                                covered, weak topics,
                                                attempted/correct, PYQ
                                                attempted/correct,
                                                self-confidence, continue?,
                                                notes) → mastery.service

components/dashboard/             🔜 Part 3 — WeakConceptList, MasteryBar,
                                                CoverageBadge

tests/unit/
├── mastery.test.ts               🔜 Part 3
└── completion.test.ts            🔜 Part 3
```

**Done when:** after any quiz or manual Study Report, ConceptStats/mastery
update and the weak-concept list reflects it — no rigid 90/87/82 thresholds,
the formula is configurable.

---

## Part 4 — DPP Engine

```
prisma/schema.prisma              🔜 Part 4 additions — DPP, DPPQuestion

server/domains/
└── dpp/
    ├── dpp.config.ts             🔜 Part 4 — configurable proportions
    │                                          (weak/prereq/revision/mistake/
    │                                          PYQ/mixed — default 4/3/3/3/4/3)
    ├── dpp.service.ts            🔜 Part 4 — candidate-source SQL queries +
    │                                          composer (rule-based, no LLM)
    └── dpp.test.ts                🔜 Part 4 — proportion + no-duplicate tests

app/
└── practice/
    └── dpp/page.tsx                🔜 Part 4 — today's DPP, 20-question set

app/api/
└── dpp/
    └── generate/route.ts           🔜 Part 4 — POST generate today's DPP
                                                  (idempotent per day)

tests/integration/
└── dpp-generation.test.ts          🔜 Part 4
```

**Done when:** the app hands you a personalized daily practice set with no
manual question picking.

---

## Part 5 — Planner (priority engine, exam countdown, phases)

```
prisma/schema.prisma                🔜 Part 5 additions — StudyPlan,
                                        PlanItem, PlanSnapshot, PlannerDecision,
                                        UserOverride, Flashcard (ts-fsrs
                                        fields), ReviewState (FSRS columns)

server/domains/
├── planner/
│   ├── priority.service.ts         🔜 Part 5 — marks-weighted priority
│   │                                             formula (weakness +
│   │                                             importance + remaining
│   │                                             syllabus + prereq +
│   │                                             mistake freq + revision
│   │                                             urgency + recent perf +
│   │                                             prep phase), versioned
│   ├── phase.service.ts             🔜 Part 5 — date-based phase resolver
│   │                                             (Phase 1–4 from exam date)
│   ├── planner.service.ts            🔜 Part 5 — Master Plan → Adaptive Plan
│   │                                              → Today's Target
│   ├── velocity.service.ts           🔜 Part 5 — personal unit-velocity
│   │                                              learning (easy/medium/hard
│   │                                              day estimates from actual
│   │                                              history)
│   └── override.service.ts           🔜 Part 5 — records UserOverride,
│                                                   preserves unresolved
│                                                   weakness for future
│                                                   revision
├── flashcards/
│   └── fsrs.service.ts               🔜 Part 5 — ts-fsrs integration,
│                                                   next-review scheduling
└── analytics/
    └── pace.service.ts               🔜 Part 5 — finish-date projection,
                                                    "Am I on track?" numbers

app/
├── planner/
│   └── page.tsx                       🔜 Part 5 — Today screen: recommended
│                                                    action + reason, pace
│                                                    meter, phase indicator
├── flashcards/
│   └── page.tsx                       🔜 Part 5 — FSRS review queue
└── reports/
    └── page.tsx                       🔜 Part 5 — weekly review, "why am I
                                                     not progressing?"

app/api/
└── planner/
    ├── today/route.ts                  🔜 Part 5 — GET next best action
    └── override/route.ts               🔜 Part 5 — POST override decision

server/jobs/
├── daily-maintenance.ts               🔜 Part 5 — update retention, rebuild
│                                                    review queue, roll
│                                                    missed plan items,
│                                                    prepare next DPP
└── weekly-review.ts                    🔜 Part 5 — weekly stats + plan update

tests/unit/
├── priority.test.ts                    🔜 Part 5
└── planner.test.ts                     🔜 Part 5
```

**Done when:** opening the app shows one clear next action with an
explainable reason, and exam-date pace tracking works.

---

## Part 6 — Mock Simulator (deferred until 1–5 are solid)

```
prisma/schema.prisma                   🔜 Part 6 additions — Mock-specific
                                           Test subtype fields (deadlineAt)

server/domains/tests/
└── mock.service.ts                     🔜 Part 6 — server-authoritative
                                                      deadlineAt, full-length
                                                      structure per exam year

app/
└── mocks/
    ├── page.tsx                          🔜 Part 6 — mock list
    └── [mockId]/
        ├── page.tsx                       🔜 Part 6 — full simulator UI
        └── result/page.tsx                🔜 Part 6 — subject/topic/type
                                                         breakdown, first-
                                                         attempt vs changed-
                                                         answer accuracy,
                                                         guess rate

app/api/mocks/
├── route.ts                              🔜 Part 6
└── [id]/submit/route.ts                  🔜 Part 6

components/mocks/                         🔜 Part 6 — MockTimer (deadlineAt-
                                                        based, survives
                                                        backgrounding),
                                                        MockAnalytics
```

**Done when:** a full mock survives phone lock/refresh and scores itself
against server time, not `setInterval`.

---

## Part 7 — AI Layer (only after everything above is stable)

```
server/domains/ai/
├── ai.service.ts                        🔜 Part 7 — generateText/
│                                                      generateStructured/
│                                                      stream/embed interface
├── budget-guard.ts                       🔜 Part 7 — hard quota cap, logs
│                                                       provider/model/
│                                                       purpose/cost/cache
├── explanation.service.ts                🔜 Part 7 — cached AI explanations
├── hint.service.ts                       🔜 Part 7 — staged hints
├── mistake-classifier.ts                 🔜 Part 7 — suggests mistake tag
│                                                       (non-authoritative)
└── study-report-extractor.ts             🔜 Part 7 — NL → Study Report
                                                        draft (same schema as
                                                        Part 3's manual form)

app/
├── tutor/
│   └── page.tsx                            🔜 Part 7 — chatbot UI
└── api/
    └── chat/route.ts                       🔜 Part 7 — POST message →
                                                          extraction → draft
                                                          → user confirms →
                                                          Part 3 service

tests/unit/
└── ai-eval.test.ts                          🔜 Part 7 — benchmark set
                                                          (classification/
                                                          explanation
                                                          accuracy)
```

**Explicitly deferred beyond Part 7:** RAG, PDF ingestion, automatic
resource discovery, resource ranking, AI-generated questions, model router,
PostHog, Dexie/offline sync, custom ML, experiment framework, multi-user
infra.

---

## Cross-cutting files (touched across multiple parts, listed once)

```
server/domains/analytics/
└── analytics.service.ts        🔜 Part 3 start, extended Part 5/6 —
                                    QUESTION_VIEWED, ANSWER_SUBMITTED,
                                    TEST_SUBMITTED, TOPIC_STUDIED,
                                    MISTAKE_CREATED, PLAN_ITEM_COMPLETED event
                                    log + rollups

server/services/
├── backup.service.ts            🔜 Part 1 (schedule) — daily encrypted
│                                    PostgreSQL dump, last-backup-age check
└── logger.ts                    🔜 Part 1

.github/workflows/
├── ci.yml                       🔜 Part 1 — lint, typecheck, unit tests,
│                                    build, schema validation
└── backup.yml                   🔜 Part 5 — scheduled daily backup job

docs/
└── GATE_AI_ARCHITECTURE.md      ✅ (copy of the architecture doc you supplied)
```

---

## Build order summary

| Part | What | Depends on |
|---|---|---|
| 0 | Setup (Next.js/Tailwind/Prisma install) | — |
| 1 | Foundation — auth, syllabus, shell UI | 0 |
| 2 | Question bank, test engine, grading | 1 |
| 3 | Learning state — mastery, mistakes, coverage | 2 |
| 4 | DPP engine | 3 |
| 5 | Planner — priority, phases, FSRS flashcards | 3, 4 |
| 6 | Mock simulator | 2, 3 |
| 7 | AI layer — chatbot, hints, explanations | 3 (study reports), budget guard |

Each part is independently demoable per its "Done when" line above. Start
Part 1 and Part 2 together, since the test engine needs real syllabus IDs to
attach questions to.
