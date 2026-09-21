# UI/UX Fix Pass — Summary

Audit and repair pass across the whole app: design-system conformance, shell/nav
coverage, mock + DPP end-to-end flows, missing cron endpoints, and Vercel
readiness. Every item below was verified against a running local build, not just
by reading code.

Reference: `DESIGN.md` (canonical token/component spec) and
`dashboard-demo.html` (reference implementation).

---

## 1. Design-system conformance

Inventoried every hex literal in `app/` and `components/` and compared against
the palette in `DESIGN.md` §2.

| Hex | Status |
|---|---|
| `#111111`, `#77736D`, `#E3E0DA`, `#D98E2B`, `#ECE9E3`, `#0E8074`, `#3A3A3A`, `#F8F6F2`, `#222222`, `#9B968E`, `#F4DEB4`, `#D0CCF4`, `#C7E3F5`, `#BDEBD9` | In palette |
| `#CFE7F0`, `#CDE8E2` | **Removed** — off-palette blue/green in the mock result tiles |

Both offenders were in `app/mocks/[mockId]/result/page.tsx`. The accuracy tile now
uses Sky (`#C7E3F5`) and the attempt-rate tile uses Mint (`#BDEBD9`). This also
restores the "teal = progress/positive" rule (§2): the two tiles previously
introduced two undefined near-teals that read as a third and fourth accent.

A grep-based guard now returns empty, so no undefined colour is referenced
anywhere in the UI.

### Other design-system checks (all passed)

- Radii follow §4: 20–24px for hero/stat/continue-learning/concept panels,
  `rounded-full` for pills, no radius at page/column level.
- No excluded elements from §7 are present: no 3D art, no sparkle/AI decoration,
  no social proof, no outer page frame or floating-card shadow.
- Progress-bar fill animation is the only motion (§6) and is already guarded by
  `prefers-reduced-motion` in `app/globals.css`.
- Teal/amber are never used decoratively.

---

## 2. Shell and navigation coverage

`AppShell` is the single shell for every page (DESIGN.md §1). Five routes were
rendering with no nav rail at all, leaving the user stranded mid-flow. All are
now covered.

| Route | Before | After |
|---|---|---|
| `app/practice/[unitId]` | Bare, narrow centred card | `AppShell active="practice" width="reading"` |
| `app/tests/[testId]/result` | Bare, `max-w-3xl` centred | `AppShell active="tests"` |
| `app/mocks/[mockId]/result` | Bare, own padding | `AppShell active="mocks"` |
| `app/tests/[testId]` | Bare, no way back | Focus surface + hairline top bar with "← Test history" and the timer |
| `app/(auth)/login`, `app/` (root redirect) | Intentionally shell-free | Unchanged |

The test runner and mock simulator stay deliberately shell-free — an exam is
focus mode and `MockSimulator` draws its own full-bleed chrome. The test runner
gained a slim header so "← Test history" is always reachable without adding the
rail.

`app/tutor` is not a canonical nav item, so it uses `active="today"`, matching
the existing `NavRail` mapping for `/tutor`. A link from the dashboard makes the
page reachable.

---

## 3. Vercel deployment blockers

### Missing cron endpoints (deployment-breaking)

`vercel.json` schedules `/api/cron/daily` and `/api/cron/weekly`. Neither route
existed — Vercel cron would have 404'd on every invocation, and `README.md`
documents the route as `app/api/cron/[job]/route.ts`.

Created `app/api/cron/[job]/route.ts`:

- Bearer auth against `CRON_SECRET`; returns 401 without it, 500 if unset.
- `daily` → `runMockMaintenance()` (finalise expired mocks, heal learning
  hand-offs) then per-user `runDailyMaintenance()` with `prepareDpp` wired to
  `generateTodaysDPP`, closing the "Part 4 wiring left for other Parts" gap.
- `weekly` → per-user `runWeeklyReview()`.
- Unknown job → 404. Per-user failures are caught and reported in the payload so
  one bad row does not fail the whole sweep.
- `maxDuration = 300` for the cron timeout budget.

Verified: 401 without auth, 401 with a wrong secret, 404 for an unknown job, 200
with the real secret. Running `daily` twice produced identical output, confirming
the jobs are idempotent as documented.

### Other config

- `next.config.js` hardcoded `serverActions.allowedOrigins` to `localhost:3000`,
  which breaks server actions on any deployed origin. It now also allows
  `NEXT_PUBLIC_APP_URL`.
- Added `postinstall: prisma generate` and a `vercel-build` script. Prisma Client
  is otherwise not generated on a clean Vercel install.

---

## 4. Functional QA

`npm run build` compiles successfully and `/api/cron/[job]` appears in the route
manifest. Against a running production build, with a real signed-in session:

- **Route smoke test** — `/dashboard`, `/syllabus`, `/tests`, `/mistakes`,
  `/practice`, `/practice/dpp`, `/planner`, `/reports`, `/flashcards`, `/mocks`,
  `/tutor`, `/study-report` all return 200, each renders exactly one `main` and
  one rail, and none report horizontal overflow. A bogus path correctly returns
  404.
- **Mobile** — no horizontal overflow and the bottom nav renders on every route
  checked.
- **Console** — zero console errors across the run, except the deliberate 404.
- **Mock flow** — creation, "Begin mock", MCQ selection, autosave and restore
  after reload, submit, and result render. The result page now carries the shell
  and contains no off-palette colours.
- **DPP flow** — question render, verdict, solution, next, and recap persistence
  after reload.
- **Flashcards** — empty state renders correctly ("Nothing due").
- **Tutor** — `/api/chat` returns 200 and the page surfaces a clear, actionable
  message when a free-text report can't be parsed, rather than failing silently.
- **Favicon** — `app/icon.svg` resolves with 200, clearing the stray 404.

---

## 5. Notes and follow-ups

- Local QA harnesses (`qa-flows.js`, `qa-snap.js`, `genbank.mjs`, `genq.mjs`,
  `pgstart.mjs`) are kept locally but added to `.gitignore` — they are dev
  utilities, not app code. `tsconfig.tsbuildinfo` was untracked for the same
  reason.
- The mock/DPP question bank was small enough that `POST /api/mocks` returned a
  422 with per-concept shortfalls; it now holds 65 imported questions and
  creation succeeds with 201. `NewMockButton` renders the shortfall in readable
  language instead of raw JSON.
- Deploying requires `CRON_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
  `ALLOWED_EMAILS` and `NEXT_PUBLIC_APP_URL` to be set in the Vercel project.
  `CRON_SECRET` is not in `.env.example` yet — worth adding.
- `/api/chat` returns `kind: "unavailable"` when `LLM_API_KEY` is unset. That is
  the intended graceful degradation, not a bug.
