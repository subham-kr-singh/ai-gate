// No hard-coded question content lives here on purpose. The trusted
// ~1,000–1,500 question corpus (architecture "Question Bank") is source
// material you supply, not something to hand-author or regenerate from
// model knowledge — import it with `npm run import:questions -- <file>`
// (see scripts/import-questions.ts), which validates every row with the
// same Zod schema used everywhere else in the app.
//
// This file exists as the documented extension point: if you'd rather
// seed a small fixed sample set for local dev (e.g. 20 hand-picked
// questions checked into the repo), export it as `sampleQuestions` below
// and wire it into prisma/seed/index.ts.

export const sampleQuestions: unknown[] = [];
