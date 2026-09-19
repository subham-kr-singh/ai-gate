# GATE AI — Design System

**Design brief (self-defined, per frontend-design skill):** a personal
instrument for one engineering student's daily GATE preparation — not a
marketing site, not a multi-tenant SaaS dashboard. The person using it opens
it 2–4 times a day, under exam-clock pressure, to answer one question fast:
*what do I actually know, and what do I do next.* The subject matter is
engineering precision: admit cards, technical drawings, circuit diagrams,
instrument panels, drafting tables — not lifestyle-SaaS softness.

---

## Pass 1 — Design plan

### Color — "Drafting Table" palette (dark-navy + teal/amber, as you already use for your PDFs)

| Name | Hex | Role |
|---|---|---|
| Navy Ink | `#0D1321` | Primary background (dark-first — this is a focus tool, used at night as often as day) |
| Panel Navy | `#131B2E` | Elevated surface: panels, the test-taking screen, modals |
| Slate | `#3A4459` | Borders, dividers, secondary/disabled text |
| Fog | `#E8EAF0` | Primary text on dark surfaces |
| Signal Teal | `#0E8074` | Primary interactive color — links, primary buttons, mastery/progress fills, "on track" state |
| Alert Amber | `#D98E2B` | Urgent/due/weak signal only — revision-due badges, low-mastery bars, mistake counts. Never decorative. |
| Paper (light mode) | `#F1F3EE` | Optional light theme background — a cool sage-grey, not a warm cream, so it doesn't collide with the terracotta-on-cream AI-default look |

Six named colors, teal and amber doing real semantic work (progress vs.
urgency) rather than sitting there as brand decoration.

### Type

- **Display / headings:** Archivo (SemiExpanded, 600–700 weight). Confident,
  geometric, slightly technical — reads like the typeface on an official
  exam document or a lab equipment panel, not a startup landing page.
- **Body / data / UI:** IBM Plex Sans. Designed originally for IBM's own
  technical/engineering systems — fits an instrument for an engineering
  exam far better than a generic humanist grammar-neutral face, while
  staying highly legible at small sizes with real tabular figures for
  scores, percentages, and the mock timer.
- One family pairing only. No monospace anywhere — not even for the timer
  or stat labels (Plex Sans's tabular numerals do that job without
  reaching for the "mono = data" cliché).
- Type scale follows Elements of Typographic Style defaults: a single
  modular scale (1.25 ratio), line length capped under 80ch for any prose
  (mistake notes, explanations), tighter line-height for the numeric
  headline stats.

### Layout — "Instrument panel," not a card grid

```
Desktop (Today screen):
┌──┬──────────────────────────────────────┬───────────────┐
│▎ │  NEXT TARGET                          │ Coverage  72% │
│▎ │  OS → Memory Management → Page Repl.  │ ▬▬▬▬▬▬▬▬▬░░░  │
│▎ │  Repeated FIFO/LRU mistakes, PYQ 48%  │               │
│▎ ├──────────────────────────────────────┤ Mastery   59% │
│▎ │  Review → 5 questions → mastery check │ ▬▬▬▬▬▬░░░░░░  │
│▎ ├──────────────────────────────────────┤               │
│▎ │  DPP 8/10   Reviews due 6   Weak 4    │ Days to exam  │
│▎ │                                        │      47       │
└──┴──────────────────────────────────────┴───────────────┘
 ↑ priority spine (color-coded by urgency, see below)
```

- Left-aligned, dense, no centered marketing-style hero block.
- Hairline 1px `Slate` dividers between panel modules — flat panels, not a
  kit of identically-rounded drop-shadowed cards. Border-radius is spent
  only on the two things a person actually clicks or types into (buttons,
  inputs — 6px) and on the one hero element below. Data panels stay
  square-cornered, like a technical drawing.
- The **priority spine**: a 3px-wide colored bar running down the left
  edge of each item in Today/Planner/DPP lists — Amber for due/weak, Teal
  for on-track/new, Slate for snoozed. This replaces the generic rounded
  "status pill/badge" pattern and is legible at a glance without reading
  text — closer to a physical priority flag than a SaaS chip.

### The one bold element

A single circular **Mastery Ring** on the Concept Detail and Dashboard
screens — a thin teal/amber-split ring showing mastery vs. the gap to
target. It's the one place radius, color-saturation, and motion (a single
fill animation on first load, never repeated on every scroll) are spent.
Everything else in the interface stays quiet and disciplined around it.

### Motion

One orchestrated moment only: the Mastery Ring fills once on page load.
Everything else animates only in direct response to a person's action —
selecting an MCQ option, confirming a DPP submission, the mock timer
ticking. No fade-slide-up-on-scroll per section, no hover-lift on every
card — those are the generic tells this skill exists to avoid.

### Writing / voice

Active voice, plain engineering language, no salesy framing:
- Buttons say what happens: "Submit test," "Log mistake," "Move on
  anyway" — not "Get started" or "Submit →".
- No ALL-CAPS eyebrows, no middot-joined meta lines, no arrow-suffixed
  links, no numbered 01/02/03 markers unless the content is a genuine
  sequence (e.g., the four preparation phases — that *is* a sequence, so
  numbering it is earned, not decorative).
- Empty/error states explain what happened and what to do, in the
  interface's voice: "No reviews due today — check back tomorrow," not
  "Oops! Nothing here yet 👀."

---

## Pass 2 — Critique against the generic AI-design defaults

Checked against the five clustering patterns to avoid:

1. **Warm cream + terracotta serif** — avoided outright: this system is
   dark-navy-first per your own stated preference, and the one light-mode
   background (`#F1F3EE`) is a cool sage-grey, not the flagged `#F4F1EA`
   warm cream. No terracotta anywhere; amber is a cooler, more brass-toned
   `#D98E2B`, reserved for urgency, not brand decoration.
2. **Near-black + single acid accent** — avoided: two accent colors doing
   distinct semantic jobs (teal = progress, amber = urgency), not one
   decorative brand color.
3. **Broadsheet newspaper columns** — avoided: this is a left-aligned
   instrument panel with a priority spine, not center-justified dense
   newspaper text columns.
4. **SaaS card kit (uniform rounded cards + soft shadow + gradient
   wash)** — explicitly avoided: flat hairline-divided panels, radius
   spent only on buttons/inputs/the mastery ring, no drop shadows, no
   gradient washes anywhere.
5. **Template chrome** (ALL-CAPS eyebrows, middot meta strings, em-dash
   labels, mono data labels, arrow-suffixed CTAs) — explicitly banned in
   the writing rules above.

Everything free in the brief (this app has no imposed brand) was spent on
choices specific to "personal engineering exam instrument" — Archivo +
Plex Sans instead of a marketing serif, the priority-spine device instead
of status pills, and the mastery ring as the single bold element instead
of a gradient hero.

---

## Implementation

Tokens are implemented in `tailwind.config.ts` and `app/globals.css` (CSS
variables, so the light/dark swap doesn't require duplicating component
code) — see those files. Component-level rules:

- `components/ui/` — Button, Input, Divider, MasteryRing, PriorityBar,
  ProgressBar, Table (all built against the tokens below, no ad-hoc hex
  values in component code).
- Radius: `--radius-control: 6px` (buttons/inputs), `0` everywhere else,
  `--radius-ring: 9999px` (Mastery Ring only).
- Shadow: none by default. The only permitted shadow is a 1px hairline
  border substitute for modal/overlay separation (`--shadow-overlay`),
  never a soft card shadow.
