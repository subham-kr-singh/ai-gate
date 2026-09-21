# GATE AI — Part 6: Mock Simulator

Full-length mock tests where **the server owns the clock**. A mock survives a locked phone, a
refresh, or a flaky network, and scores itself against server time, not a `setInterval`.

Follows `PROJECT_PLAN.md` Part 6, the architecture doc (§22–24, §33, §62, §66, §75, Phase B) and the
canonical `design.md` (Inter, `#F8F6F2`, full-bleed, teal = progress, amber = urgent).

## What you get

| Area | Files |
|---|---|
| Schema | `prisma/part6-schema-additions.prisma` (4 models, 3 enums, relation-free) |
| Pure domain | `mock.blueprint.ts` `mock.assembly.ts` `mock.timer.ts` `mock.reducer.ts` `mock.analytics.ts` |
| Orchestration | `mock.service.ts` over the ports in `mock.ports.ts` |
| Adapters | `mock.repository.ts` (Prisma, row-locked) · `mock.context.ts` (**wiring to Parts 1–3**) |
| API | `app/api/mocks/`: list/create · `[id]` resume · `start` · `answer` (autosave + heartbeat) · `submit` |
| Job | `server/jobs/mock-maintenance.ts` |
| UI | `app/mocks/` (list, simulator, result) · `components/mocks/` (timer, palette, question pane, simulator, analytics, review, hook) |
| Tests | `tests/unit/mock-*.test.ts(x)`: 74 tests |

The plan listed only `route.ts` and `[id]/submit`. I added `[id]`, `start` and `answer` because a mock
needs resume, an explicit clock start, and deadline-aware autosave that Part 2's routes don't provide.

## Install

1. Paste `prisma/part6-schema-additions.prisma` into `schema.prisma`, then
   `npx prisma migrate dev --name part6_mock_simulator`.
2. Copy `server/`, `app/`, `components/`, `tests/` into the repo.
3. **Adapt `server/domains/tests/mock.context.ts`.** It is the only file that touches Parts 1–3, and
   every line marked `ADAPT` is an assumption (see below). `tsc` will point at anything that differs.
4. Add to `globals.css` if the dashboard keyframe isn't already ported (design.md §6):
   ```css
   @keyframes fillbar { from { width: 0%; } }
   .animate-fill-w { animation: fillbar 900ms cubic-bezier(0.22,1,0.36,1) forwards; }
   @media (prefers-reduced-motion: reduce) { .animate-fill-w { animation: none; } }
   ```
5. Call `runMockMaintenance()` from Part 5's `daily-maintenance` job.
6. Tests: `npm i -D jsdom @testing-library/react @testing-library/dom`. The two `.tsx` tests set
   `@vitest-environment jsdom` themselves; your vitest config needs the `@/` alias and the automatic JSX runtime.

## Assumptions to verify (Parts 1–5 source wasn't available)

- **Part 1:** `getSessionUser()` in `@/server/auth/session` returns `{ id } | null`; `prisma` is a named export of `@/server/db/client`; a `/login` route exists; `getCurrentSyllabusVersionId()`.
- **Part 2:** `Question` has `status = 'APPROVED'`, `type`, `marks`, `unitId`, `topicId`, `year`, `source`, `options` (JSON `[{id,text}]`), `correctAnswer`, `solution`, and relations `subject`/`unit`/`topic`. `Attempt` has `userId`, `questionId`, `createdAt`. `gradeAnswer(question, answer, {examYear})` returns `{correct, marks}`. An attempts batch writer exists.
- **Part 3:** `masteryService.applyAttempts`, `analyticsService.track`, and `POST /api/mistakes` (body shape is a constant at the top of `MockReview.tsx`).
- Next 15+ (async `params`). Tailwind with arbitrary values, as in `dashboard-demo-v3.html`.
- Marking is **display-only** in `mock.blueprint.ts`; real grading stays in Part 2. Keep the two in sync.

## Decisions worth knowing

- **Clock.** `deadlineAt` is written once at start. The browser keeps only a clock *offset*, recalibrated on every response. The timer recomputes `deadlineAt − serverNow` each tick, so background throttling can't drift it.
- **Autosave.** Per-mock monotonic `seq`, one request in flight, backoff retry, outbox mirrored to `localStorage`. The server logs events append-only and ignores duplicate seqs; an older seq never overwrites a newer answer. Submit carries any unsent events.
- **Late delivery.** Answers stamped before the deadline are honoured for 10 minutes after it (bad signal at the buzzer). After that the server finalises the mock itself (`EXPIRED_SERVER`), lazily on access and via the daily job. Timestamps are trusted only as far as you trust yourself; this is a personal tool.
- **Learning hand-off.** The score is committed first; pushing into attempts/mastery is a lease-claimed, retryable second step. A failure there never loses a result.
- **Question selection.** Approved questions only, preferring ones you've never seen (independent evidence for the planner, per the recommendation-evaluation rule), spread across units, deterministic from a stored seed.
- **Analytics.** Score, accuracy, attempt rate, time lost, "did changing answers help", guessing (an optional "I am guessing" toggle), reviewed-question accuracy, and section/subject/unit/topic/type/marks breakdowns. **No rank, percentile or predicted score** (§33). Groups under 3 questions are labelled "small sample" and never judged.
- **Design.** No new colours. Palette states use shape/border plus a text label, not colour alone. The timer is an amber-filled pill with text at ≤10 min (amber text alone is under 3:1 contrast on the cream surface).

## Verification status: read this

**Done**, in a scratch project: `tsc --strict` clean (the repository was checked against a generated Prisma 6 client), and 74 tests passing. Those cover the pure logic, the service against an in-memory repo, the client hook driven end to end against the real service through a fake `fetch` (outage, refresh replay, NAT debounce, submit-with-outbox, server-side expiry), and SSR renders of every component.

**Not done:**
- The Prisma repository has never run against a real Postgres. Locking and upserts are typechecked, not exercised.
- `mock.context.ts` is unverified against your Parts 1–3.
- The UI has not been seen in a browser, and there is no Playwright spec.
- Wake-lock and real phone-lock behaviour are untested on a device.

Do one real mock on your phone and one on your laptop before trusting it.

The GATE 2027 pattern (65 Q / 100 marks / 3 h; GA 15 + EM 13 + core CS 72; MCQ-only negative marking) was checked against published summaries, not the official IIT notification. The per-subject marks in `mock.blueprint.ts` are starting weights that sum to the right totals; tune them against recent papers.
