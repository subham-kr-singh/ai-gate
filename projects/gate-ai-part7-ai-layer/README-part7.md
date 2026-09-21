# Part 7 — AI Layer

Implements the file map from `PROJECT_PLAN.md` § Part 7. Drop these paths
directly into the existing `gate-ai/` repo (same relative paths).

## Files

```
server/domains/ai/
├── types.ts                    Zod schemas shared by every AI module
├── ai.service.ts                generateText / generateStructured / stream / embed
├── budget-guard.ts               hard daily quota cap + usage logging
├── explanation.service.ts        cached, grounded wrong-answer explanations
├── hint.service.ts               staged hints (hint1 → hint2 → concept → solution)
├── mistake-classifier.ts         non-authoritative mistake-tag suggestion
└── study-report-extractor.ts     NL → Study Report Draft (never auto-committed)

app/
├── tutor/page.tsx                chatbot UI: message → draft → confirm
└── api/chat/route.ts             POST /api/chat — extraction only, no writes

tests/unit/
└── ai-eval.test.ts               benchmark skeleton (§77), opt-in live run

prisma/
└── schema-additions-part7.prisma  AIUsageLog, AIInteraction, AIOutput, Job
```

## Wiring checklist

1. **Merge the Prisma models.** Copy the four models from
   `schema-additions-part7.prisma` into the main `prisma/schema.prisma`,
   then `npx prisma migrate dev --name part7_ai_layer`.
2. **Swap the in-memory stores for real persistence.**
   - `budget-guard.ts`: replace `usageLog` array with `AIUsageLog` reads/writes.
   - `explanation.service.ts`: replace `InMemoryExplanationCache` with an
     `AIOutput`-backed implementation (`get`/`set` against `questionId` +
     `contentHash`).
3. **Point `/api/study-reports` at Part 3.** `app/tutor/page.tsx` posts
   the confirmed draft to that existing endpoint — the chat route never
   calls it directly.
4. **Session/auth.** `app/api/chat/route.ts` imports
   `getSession` from `server/auth/session.ts` (Part 1) — no change needed
   if that file's signature is `(req: NextRequest) => Promise<Session | null>`.
5. **Path alias.** These files use `@/server/...` — confirm `tsconfig.json`
   has `"@/*": ["./*"]` (set up in Part 0).

## Environment variables

Add to `.env.example` (Part 0 already reserves this section):

```env
LLM_API_KEY=
LLM_MODEL=claude-haiku-4-5-20251001
AI_DAILY_BUDGET_CENTS=200
```

## Dependencies

```bash
npm install ai @ai-sdk/anthropic
```

(`zod` and `vitest` are already in the Part 0 dependency list.)

## package.json script

```json
{
  "scripts": {
    "test:ai-eval": "AI_EVAL_LIVE=1 vitest run tests/unit/ai-eval.test.ts"
  }
}
```

Kept separate from the default `npm test` run since it spends real AI
budget — run it manually or on a nightly CI schedule, not per-PR.

## What this deliberately does NOT do

- No model router (`§42` — explicitly deferred past V1; one fixed model
  per purpose in `ai.service.ts`, change `LLM_MODEL` directly for now).
- No RAG/embeddings (`embedText()` throws on purpose — Phase 8).
- No direct DB writes from any AI module. Every function here returns a
  proposal or a draft; Parts 1–6's domain services remain the only code
  path that touches `ConceptStats`, `LearningState`, or `Mistake`.
- No AI-generated questions (explicitly deferred).
