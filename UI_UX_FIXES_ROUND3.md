# UI/UX Audit — Round 3 (review queue, Vercel, polish)

Third pass against `DESIGN.md` (canonical per `dashboard-demo-v3.html`), covering
the multi-source ingestion pipeline and the review queue end to end. Every item
below was reproduced against the running app before being fixed, and re-checked
after.

Round 2 (`UI_UX_FIXES_ROUND2.md`) had already covered the shell, focus rings,
the login form, the submit dialog and the Vercel migrate step. This round is
what that pass left at the bottom: the state machine behind the review queue,
the counts that drive its filters, and the empty/terminal states.

## What was wrong and what changed

### 1. A published draft could be rejected or flagged (data-integrity bug)

`decide()` in `server/domains/ingestion/review.service.ts` only special-cased a
repeat *approval*. Reject and flag had no guard at all, so rejecting an already
approved draft flipped the draft to `REJECTED` and left the `Question` row it had
produced sitting in the bank, still `APPROVED`. The two records then disagreed
about the same content — exactly the kind of silent divergence the review gate
exists to prevent.

Reproduced against the live DB:

```
before: APPROVED  question=cmuduour6... status=APPROVED
decide("reject") -> {"outcome":"rejected"}
after:  REJECTED  question=cmuduour6... status=APPROVED   <-- contradiction
```

Fixed in the service, which is the authoritative gate:

```ts
// A promoted draft is terminal. Its question is live in the bank, and no
// decision available here can un-publish it...
if (draft.status === "APPROVED" && draft.promotedQuestionId) {
  return { outcome: "noop", draftId, reason: "Already published to the question bank." };
}
```

Take this as a server-side rule rather than a UI one: the endpoint is reachable
directly, so disabling the buttons alone would have hidden the bug rather than
removed it. The UI change below is the matching affordance, not the fix.

### 2. The review pane let you click the three decisions anyway

`components/review/ReviewQueue.tsx` still rendered Flag / Reject / Approve as
enabled on a published draft. `DraftPane` now derives `published` and disables
all three, and the banner says where withdrawal actually lives:

> Published as question `…`. Withdraw it from the question bank, not here.

### 3. "Rejected" and "Flagged" 409s left the pane showing stale buttons

`decide` already re-loaded the detail on a 409, and the approve path was
covered. The reject/flag paths return a plain `noop` now instead of a mutation,
so the pane and the banner agree after the click. Verified in the browser: the
click produces no state change and no toast.

### 4. Filter chips counted the wrong set

Two related defects in `listDrafts`:

- The **"All"** chip called `count({ where })`, which includes the active status
  filter — so selecting "New" made "All" report 3 instead of 9.
- The per-status counts were global even after a source was selected, so
  switching to one adapter still showed every adapter's totals.

Both now derive from a `scopedWhere` that honours the adapter but not the
status, which is what a chip row is supposed to mean. Verified by API:

| Request | All | DRAFT | UNDER_REVIEW | APPROVED |
| --- | --- | --- | --- | --- |
| no filter | 9 | 3 | 1 | 5 |
| `status=DRAFT` | 9 | 3 | 1 | 5 |
| `adapter=ui-demo` | 8 | 3 | 1 | 4 |

### 5. Reject on an already-rejected draft silently did nothing visible

Covered by the same `noop` result: the reason string now reaches the toast
(`outcomeMessage` reads `body.reason` for `noop`), so a double-click explains
itself instead of appearing broken.

## Verified after the changes

- `npx tsc --noEmit` — clean
- `npx next lint` — no warnings or errors
- `npx vitest run` — 281 passed, 25 skipped (306 tests)
- `RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/draft-review.test.ts`
  — 9 passed, including a new case asserting a published draft is terminal for
  reject and flag and that its `Question` stays `APPROVED`
- `npx next build` — compiled successfully
- All 11 app routes return HTTP 200 with no runtime or hydration errors
- Review queue in the browser: mount detail load, approve, auto-advance to the
  next row, and the published-draft disabled state all confirmed against the
  running production server
- Summary counts confirmed against the API for the unfiltered, status-filtered
  and adapter-filtered cases

## Confirmed already compliant

- `tailwind.config.ts` matches the DESIGN.md palette value-for-value; no
  hardcoded hex in component source outside `lib/design-tokens.ts` and prose.
- The global `:focus-visible` rule in `app/globals.css` sits *after* Tailwind's
  `.outline-none` in the emitted stylesheet, so `outline-none` controls still
  get a visible teal ring. Checked in the built CSS (offset 24151 vs 26582) —
  this is why the bare `outline-none` call sites are not the accessibility bug
  they look like.
- No monospace families; numeric columns use `tabular-nums` (DESIGN.md §3).
- No page-level shadows, gradients, decorative art or sparkle iconography
  (DESIGN.md §7).
- `line-clamp-2` is present in the emitted CSS — it is core in Tailwind 3.4,
  so the queue's two-line preview does not depend on the line-clamp plugin.

## Vercel deployment notes

- `vercel-build` is `prisma generate && prisma migrate deploy && next build`.
  Keep the migrate step: without it a fresh project builds and then 500s on
  missing tables.
- Required env vars on the project: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`
  (≥16 chars), `ALLOWED_EMAILS`, `CRON_SECRET`. `GEMINI_API_KEY` / `LLM_API_KEY`
  are optional and every AI-assisted stage degrades to a deterministic
  fallback without them.
- `next.config.mjs` appends `NEXT_PUBLIC_APP_URL` to
  `serverActions.allowedOrigins`, so set it to the deployment origin or server
  actions break in production.
- If preview deployments have Deployment Protection on, an agent cannot reach
  the preview URL. Either generate a Protection Bypass secret and pass it as
  `x-vercel-protection-bypass`, or set Vercel Authentication to "Only
  Production Deployments".

## Next steps

- Responsive visual pass at 375px and 768px on the routes other than Review.
- Source-level capture rate for ExamSide/GFG is still bounded by the source
  (GFG returns 403 to non-browser clients); the pipeline reports this as
  `source-level` errors on the draft rather than silently publishing.
