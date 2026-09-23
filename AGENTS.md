# AGENTS.md — GATE AI working notes

## Environment (this sandbox)
- Postgres is NOT installed system-wide. The prior session used the npm package
  `embedded-postgres`. Start it with:
  - `node pgstart.mjs` — one-shot init (WIPES an existing cluster; run only when fresh)
  - `(nohup node pgkeep.mjs > /tmp/pgk.log 2>&1 &)` — idempotent, preserves data dir
  - Data dir: `/tmp/gatepgdata` (deleted when the sandbox is recycled)
  - Conn: `postgresql://postgres:postgres@127.0.0.1:5432/gate`
- After a fresh cluster: `npx prisma migrate deploy && npm run seed`.
- Docker is available but `dockerd` is not running; `sudo dockerd &` then
  `sudo chmod 666 /var/run/docker.sock` if a container is needed.
- Foreground terminal commands are capped below the 1200s idle threshold — run
  long jobs in the background and poll a log file.

## Ingestion pipeline baseline (pre-multi-source refactor)
- `npx tsx --env-file=.env scripts/_dump.ts gatecse-2026 /tmp/baseline.json`
  dumps every `BuiltRecord` as JSON. Pre-refactor md5: `848b4b18f5dbd7b23c37b693aebbb89b`
- 4303 blocks, 625 publishable, 3550 mapped to a syllabus entity.
- Subject distribution: GA 1033, MATH 430, PDS 346, OS 336, DL 302, DBMS 256,
  TOC 204, ALGO 194, COA 181, CD 154, CN 114, unmapped 753.
- ~85% of GO blocks carry rasterised math that pdf.js cannot recover, which is
  why the human review gate is load-bearing.

## Source recon (checked 2026-09-21)
- **ExamSide** (`questions.examside.com`): `robots.txt` allows `User-agent: *`
  but disallows `GPTBot`. Chapter pages (`/past-years/gate/gate-cse/<chapter>`)
  list questions as `cp-q` previews only — the preview is TRUNCATED and is not
  the full statement. Full statement + options live at
  `/past-years/gate/question/<slug>`.
  - The HTML does NOT contain the answer. Every option ships an identical
    hidden `<span class="tag-correct">` template, and `data-state` is always
    empty. `Question.*.css` hides `.tag-correct` unless the option has
    `data-state=correct`.
  - The answer is served by `POST /api/check_answer` with
    `{qid, input, options, timeSpent}`, returning
    `{status, err_code, right, corrects:[idx], selected}`. One POST per question
    returns the full key — no brute force needed.
  - Music: `data-qid` is on `.question-component`; matches are case-insensitive.
- **GeeksforGeeks**: `robots.txt` and all page requests return HTTP 403 to
  non-browser clients (CloudFront). Coverage of GATE PYQs is partial and largely
  republished. Treat GFG as blocked-by-default unless a legitimate access path
  is arranged.

## Code conventions
- Zod is the gate at every boundary. LLM output is always a *proposal* and must
  pass `questionInputSchema.safeParse` before it can reach the DB.
- Nothing auto-publishes: extracted questions become `IngestedQuestionDraft`;
  promotion to `Question` requires an explicit human approval.
- Reuse `server/domains/ai/budget-guard.ts` and `ai.service.ts` rather than
  adding a second budget/LLM path.
- `lib/env.ts` validates env vars; `GEMINI_API_KEY`/`LLM_API_KEY` are optional,
  so every AI-assisted stage must degrade to a deterministic fallback.
- A subject *hint* is not a syllabus subject. An adapter hint like `"CS"` (a
  paper code) will not match a `Subject.code` like `OS`/`DBMS`. Scoping syllabus
  candidates to a single subject silently yields nothing for such sources —
  widen to a `SUBJECT_CODE:name` catalog instead and let the resolver enforce
  the subject (`concept-mapper.ts`).
- Before adding a new AI-assisted stage, check whether `llm-assist.ts` already
  implements it. It has `classifyConcept`/`reformatBlock` wired to the budget
  guard; a stage that imports neither is dead code, which is how the archive
  pilot lost its §54 Stage 5 fallback.

## Local dev gotchas
- `next build` and `next dev` share `.next/`. Running a production build while a
  dev server is up corrupts the dev server's route chunks (`Cannot find module
  './NNNN.js'`, blank "Server Error" pages). Kill the dev server, `rm -rf .next`,
  then restart `dev` — it is a cache clash, not an app bug.
- `npx vercel --version` cannot be run here: the CLI's first-run prompt hangs
  with no TTY. Deployment happens through `vercel-build`, not this sandbox.

## Ingestion run: reading the report
- The "Schema" line is a *cascade*, not a count of distinct bugs: a block with
  no mapping emits three `Required` notes (`subjectId`/`unitId`/`topicId`). Read
  `mapped` against `extracted` for the real signal.
- `hasImageContent` / "no extractable text" blocks are correct refusals, not
  failures to fix: the source rasterised the math, so publishing would change
  the question's meaning.

## UI/UX audit invariants (checked mechanically)
- No hardcoded hex in `app/**` or `components/**` `.tsx` — colours come from
  Tailwind tokens (`tailwind.config.ts`) or `lib/design-tokens.ts` for SVG
  props and inline styles. The only remaining hex literals are in prose.
- DESIGN.md §3 forbids monospace; `tabular-nums` (Inter digits switched to
  tabular) is the sanctioned way to align numbers in columns. Do not add
  `font-*` families.
- Interactive primitives must keep a visible focus ring: `Button` and `Input`
  use `focus-visible:*`, and the global rule in `globals.css` covers the rest.
  `outline-none` without a replacement is a bug.
- Every modal gets `role="dialog"`, `aria-modal`, a labelled heading, Escape to
  dismiss, and focus moved in on open.
- `vercel-build` runs `prisma migrate deploy` before `next build`, so a fresh
  Vercel project gets its schema. Do not remove that step.
- The global `:focus-visible` rule in `globals.css` is emitted *after*
  Tailwind's `.outline-none`, so it wins the cascade and an `outline-none`
  control still shows a ring. Verify in `.next/static/css` before reporting a
  missing focus indicator — grepping for `outline-none` alone false-positives.
- A promoted draft (`status=APPROVED` + `promotedQuestionId`) is terminal in
  `decide()`. Reject/flag must return `noop` for it; otherwise the draft says
  REJECTED while its `Question` stays APPROVED, and the two records disagree.
  The UI disabling the buttons is an affordance, not the guard.
- Review-queue chip counts are scoped by adapter but never by status: a status
  chip that counted only its own status would just echo the number it filters
  to. `listDrafts` derives both from `scopedWhere`.
