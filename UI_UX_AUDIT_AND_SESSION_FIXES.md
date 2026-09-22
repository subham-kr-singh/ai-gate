# UI/UX Audit & Auto-Detected Study Sessions

Scope: full UI/UX audit against `DESIGN.md` (canonical `dashboard-demo-v3.html`),
the tutor redesign, and the "Log study session" feature request.

## 1. What changed

### Log study session is now detected, not typed
Previously `/study-report` was a blank form: the student had to retype work the
app had already recorded. Now it leads with **Recorded for you**, derived from
real evidence.

- `server/domains/mastery/session-detect.service.ts` — read-only service that
  reconstructs sessions from submitted `Attempt`/`Answer` rows (quizzes, mocks)
  and completed `DPPQuestion` rows. Groups by unit + the **student's calendar
  day** (the plan's `timezone`, falling back to UTC), computes counts,
  accuracy, source mix (quiz/mock/DPP), PYQ flag, and **weak concepts**
  (where at least one answer was wrong).
- `app/api/study-sessions/route.ts` — `GET`, auth-scoped, `days` clamped 1–90,
  invalid values fall back to 14. Returns `{ sessions }`. Reads the plan's
  `timezone` (never creates one — a GET has no write side effects) so day
  boundaries match the planner's.
- `components/study/DetectedSessions.tsx` — card list per session with accuracy,
  weak concepts, and a confidence check-in.

Detection is deliberately read-only. Applying evidence happens at submit time
in `test.service`; re-deriving a session must never write, or answers would be
counted twice. This is asserted by test.

### Low-confidence flow
Each detected card asks "How did that feel?" — Confident / Okay / Low confidence.
Low confidence routes to `/tutor?unit=<name>&intent=low-confidence`, which
pre-fills and auto-sends a question that names the unit and says the student is
not confident. The tutor reads the session numbers, discusses, and returns a
**proposal** the student must confirm. Nothing about the plan changes silently.

### Tutor UI/UX
- `useSearchParams` is isolated in `TutorChatFromQuery` behind a `Suspense`
  boundary with a skeleton fallback, so the param read cannot blank the page on
  first paint.
- The pre-filled message sends exactly once (`presetSent` ref), so a re-render
  or StrictMode double-invoke cannot post twice.

### Design-system fixes
- `components/shell/MobileNav.tsx`: drawer used `shadow-xl`. `DESIGN.md` §1/§7
  forbid shadows — replaced with a `#E3E0DA` hairline border, matching how
  depth is expressed everywhere else.
- `components/planner/ui.tsx` + `format.ts`: added the **exam-week strip**
  (`DESIGN.md` §5) — a Mon-first 7-day row with today as a solid `#111111`
  circle, rendered server-side from the plan's own day keys so it can never
  disagree with "N days to exam", plus the full-width **"+ Log study session"**
  button beneath it.

### Correctness fixes found during the audit
- **Session day boundaries.** Detection grouped by UTC day while the planner
  grouped by the student's zone, so a late-night IST session (e.g. 23:50Z and
  00:10Z) split into two cards. Detection now takes the plan's timezone; the
  client's "Today/Yesterday" label compares against the *local* day too.
- **PYQ badge.** `isPyq` was `Boolean(q.year)`, which flags *any* past year as
  PYQ. Now `year < GATE_EXAM_YEAR`, the same rule `dpp.service` and
  `test.service` use, so the badge can't disagree with the planner's PYQ
  counters.
- **Phase windows on short runways.** With fewer days than phases, the old
  clamp pushed a phase start *past the exam date*. `phaseWindows` now caps
  offsets before ordering, guaranteeing non-decreasing starts that all land on
  or before the exam; guarded by `tests/unit/planner-phase.test.ts`.
- **Exam year.** `app/practice/[unitId]` sent `new Date().getFullYear() + 1`,
  which drifts from the seeded `MarkingScheme` after 2026. It now uses the
  `GATE_EXAM_YEAR` constant that grading already relies on.
- **Truthful confidence copy.** "Noted." implied the answer was stored, but the
  check-in is deliberately non-persistent. Copy now says what actually happens.

## 2. Audit results

Checked across `app/` and `components/`:

- **Palette** — every hex in use is a token from `DESIGN.md`
  (`#111111 #F8F6F2 #ECE9E3 #0E8074 #D98E2B #F4DEB4 #D0CCF4 #BDEBD9 #C7E3F5 #E3E0DA`).
  No stray colors.
- **Shadows / hover-lift / sparkles / bounce** — the drawer `shadow-xl` was the
  only violation; fixed. `animate-pulse` remains only on loading skeletons,
  which is the one sanctioned exception; `prefers-reduced-motion` neutralizes it.
- **Status color semantics** — teal = good/resolved, amber = needs attention.
  Verified correct in `mistakes`, `reports`, and the new session cards.
- **Motion** — the week strip and session cards are static; only the sanctioned
  `animate-fill-w` progress fill and `animate-pulse` skeletons animate, both
  behind `prefers-reduced-motion`.
- **Focus + motion** — global `:focus-visible` outline in teal is present, and
  reduced-motion is handled in `globals.css`.
- **Fonts** — Inter is loaded via `next/font/google` with `display: "swap"`, so
  no invisible-text flash.
- **Theme color** — matches the app surface to avoid the iOS white band.

## 3. Verification

```
RUN_INTEGRATION_TESTS=1 npm test          209 passed | 4 skipped
tsc --noEmit                              clean
eslint .                                  clean
next build                                clean, no warnings or CSR bailout
prisma validate                           valid
prisma migrate deploy                     3 migrations, none pending
```

Automated browser QA against a clean production build (`next start`), desktop
1440px + mobile 390px: **0 failures** — every route returns 200, exactly one
`<main>`, a nav rail on every shell route, no horizontal overflow, no console
errors, and no off-palette inline colors. Malformed ids and unknown routes
return styled 404s.

Feature-flow QA (0 console errors): mock create → answer → autosave-restore on
reload; DPP question → verdict → solution → recap persists; tutor chat;
flashcards.

`tests/integration/session-detect.test.ts` (5 cases) adds a regression test for
the timezone bug: two answers straddling UTC midnight on the same IST day stay
one session when grouped by `Asia/Kolkata`, and split when grouped by UTC.

End-to-end API QA (all passed, no 500s):

```
GET  /study-sessions, ?days=7, ?days=abc   -> 200
GET  /tutor, /study-report                 -> 200
GET  /api/tutor (POST)  -> 200 / 400 on bad body
GET  /api/explain       -> 400 / 404 (correct user scoping)
GET  /api/cron/*        -> 401 without the secret
```

## 4. Deployment

No new services or dependencies. The schema change is **purely additive** —
five new objects (`Resource`, `ResourceVersion`, `ResourceChunk`,
`TutorActionLog`, enum `ResourceReliability`) and no drops; verified by diffing
model/enum lists and by grepping the migration for destructive statements.

For Vercel:

1. Set `DATABASE_URL`, `CRON_SECRET`, and the AI key in project env vars.
2. Apply migrations before/at deploy (`prisma migrate deploy`). The build itself
   runs `prisma generate && next build` via `vercel-build`.
3. Cron schedules in `vercel.json` need `CRON_SECRET` set, or the endpoints
   return 500 `NOT_CONFIGURED` by design.

## 5. Notes / follow-ups

- Concept mapping is required for an answer to be attributed. A question with no
  concepts and no unit is skipped rather than shown under a fake unit. If the
  seed corpus has unmapped questions, they will not surface here.
- Session grouping now follows the plan's timezone (default `Asia/Kolkata`).
  A student who moves zones and never updates their plan keeps the old zone.
- The confidence check-in is intentionally non-persistent; it exists to route
  the student into the tutor discussion. Persisting it (a nullable
  `confidence` column on `StudySession` + a `POST`) would be a small follow-up
  if you want self-reported confidence in analytics.
