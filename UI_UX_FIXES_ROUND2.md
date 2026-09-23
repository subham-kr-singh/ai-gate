# UI/UX Audit — Fixes Applied

Audit of the GATE AI app against `DESIGN.md` (canonical per
`dashboard-demo-v3.html`). Every item below was found by inspecting the running
app and the source, fixed, and re-verified.

## What was wrong and what changed

### 1. Missing `no-scrollbar` utility (visible glitch)

`components/dashboard/ActivityChart.tsx` scrolls horizontally on a narrow
screen and applied `no-scrollbar`, but that class was never defined anywhere.
The Monthly chart therefore rendered a raw OS scrollbar under the bars.

Defined the utility in `app/globals.css`:

```css
@layer utilities {
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  .no-scrollbar::-webkit-scrollbar { display: none; }
}
```

### 2. Duplicate `ProgressBar` components

Two implementations existed: `components/ui/ProgressBar.tsx` (unused) and
`components/planner/ui.tsx`. They had already drifted apart — the planner one
called the value a 0–1 ratio, the UI one took a 0–100 percentage — which is
exactly how a progress bar ends up wrong at one call site later.

Consolidated on one implementation in `components/ui/ProgressBar.tsx`, with
`components/planner/ui.tsx` re-exporting it so both `app/planner` and
`app/reports` keep their single import path unchanged.

### 3. Focus indicators removed with no replacement

`components/ui/Input.tsx` carried `outline-none` and supplied no alternative,
so keyboard users had no focus indicator at all on the login and NAT-answer
inputs. Added a `focus-visible` ring (visible for keyboard, invisible for mouse).

`components/ui/Button.tsx` had no focus style either. Added the same
`focus-visible` ring, matching the `focusRing` convention already used
elsewhere in the app.

### 4. Login form accessibility

- The email field had a placeholder but no label. Added a visually hidden
  `<label>` and `name`/`id`.
- The sign-in error was rendered but never announced. Added `role="alert"`,
  wired the field to it with `aria-describedby`, and set `aria-invalid` so the
  failure is both announced and tied to the input.

### 5. Submit-test confirmation dialog

`components/test/SubmitConfirm.tsx` had no dialog semantics, unlike the mock
simulator's modals. It now has `role="dialog"`, `aria-modal="true"`, a labelled
heading, Escape to dismiss (stopping propagation so the test page's own
shortcuts do not also fire), and focus moved onto the primary button on open.

### 6. Subject filter dropdown not announced to screen readers

`components/dashboard/FilterDropdown.tsx` moved a visual highlight with the
arrow keys but exposed nothing to assistive tech. Added stable option ids plus
`aria-activedescendant`, so the active option is announced as it changes.

### 7. Vercel deploy would fail on a fresh database

`vercel-build` ran `prisma generate && next build` but never applied
migrations. On a fresh Vercel project the build succeeds and then every page
500s on missing tables. Changed to:

```
prisma generate && prisma migrate deploy && next build
```

## Verified after the changes

- `npx tsc --noEmit` — clean
- `npx eslint .` — clean
- `npx vitest run` — 229 passed, 16 skipped (245 tests)
- `npx next build` — compiled successfully, 27/27 static pages generated
- `no-scrollbar` confirmed present in the emitted CSS
- All 11 app routes return HTTP 200 with no hydration or runtime warnings
- Zero hardcoded hex values remain in `.tsx` source outside prose comments;
  colours resolve through Tailwind tokens or `lib/design-tokens.ts`

## Confirmed already compliant

- `tailwind.config.ts` matches the DESIGN.md palette value-for-value.
- No page-level shadows, gradients, decorative art, or sparkle iconography
  (DESIGN.md §7).
- Hero headings use the specified `clamp()` scale; radius follows the 20–24px /
  `rounded-full` rules.
- Progress fills animate once under `prefers-reduced-motion` guards only.
- No monospace font families. Numeric alignment uses `tabular-nums`, which
  keeps Inter rather than introducing a second family.

## Dev-environment note (not a product bug)

`next build` and `next dev` share the `.next` directory. Running a production
build while the dev server is live corrupts the dev server's route chunks,
producing `Cannot find module './NNNN.js'` and blank error pages. Killing the
dev server, removing `.next`, and restarting resolves it. Recorded in
`AGENTS.md` so it is not re-diagnosed as an app fault.

## Next steps

- Responsive visual pass at 375px and 768px on the remaining routes.
- Multi-source ingestion pipeline (architecture §54) is still outstanding; no
  work was done on it in this pass.
