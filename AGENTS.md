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
