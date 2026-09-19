# GATE AI — Personal Adaptive GATE Preparation Engine

Part 1 of the build: authentication, the canonical syllabus, and the
shell UI. See `PROJECT_PLAN.md` for the full part-by-part plan and
`DESIGN_SYSTEM.md` for the visual design system.

## What's in Part 1

- Email-allowlist auth (signed cookie, no external auth library)
- Canonical syllabus imported from your `syllabus_details.md` — 10
  subjects, 55 units, preserved exactly as supplied — plus a placeholder
  General Aptitude section
- Syllabus browsing UI (`/syllabus`, `/syllabus/[subjectId]`)
- A static "Today" dashboard proving out the design system
  (`/dashboard` — wired to real data in Part 3/5)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Postgres database.** The architecture doc recommends
   Supabase's free tier. Create a project, then grab both connection
   strings (Settings → Database):
   - the **transaction pooler** URL → `DATABASE_URL`
   - the **direct/session** connection URL → `DIRECT_URL`

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Fill in `DATABASE_URL`, `DIRECT_URL`, your own email(s) in
   `ALLOWED_EMAILS` (comma-separated if more than one), and generate an
   `AUTH_SECRET`:

   ```bash
   openssl rand -hex 32
   ```

4. **Create the database schema**

   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

5. **Seed the syllabus**

   ```bash
   npm run seed
   ```

   This is idempotent — re-run it any time you edit
   `prisma/seed/syllabus.data.ts` and it will update rather than
   duplicate.

6. **Run it**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 — you'll be redirected to `/login`. Sign
   in with an email from `ALLOWED_EMAILS`.

## Verify

```bash
npm run typecheck   # should report no errors
npm run test        # syllabus data integrity tests (no DB needed)
npx prisma studio   # browse the seeded syllabus tree directly
```

## What's deliberately not here yet

Questions, tests, grading, mastery, DPP, and the planner are Parts 2–5.
`PROJECT_PLAN.md` has the exact file-by-file breakdown for each. The
`server/domains/` subfolders for those parts (`questions/`, `grading/`,
`mastery/`, etc.) are expected to be empty until then.
