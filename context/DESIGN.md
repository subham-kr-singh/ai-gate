# GATE AI — Design System (canonical, per `dashboard-demo-v3.html`)

This supersedes the earlier mint-on-mint "floating card" spec and the
dark-navy Drafting Table system. **This is the one design going forward.**
Every value below is copied directly out of `dashboard-demo-v3.html` —
nothing here is aspirational or undocumented; if a future component needs
a color or spacing value not listed here, add it to the file it's built
in and back-fill this doc, don't invent a one-off.

## 1. Structure — full-bleed, no outer frame

There is **no** colored outer page background and **no** floating-card
shadow/rounding at the page level. That treatment came from misreading
screenshot chrome as product UI (see `docs/DASHBOARD_REFERENCE_MAP.md`,
"Correction") and has been removed. The app surface is the page:

```css
body {
  background: #f8f6f2;
}
```

Three-column layout, thin `1px solid #E3E0DA` dividers between columns
instead of gaps/shadows:

```css
grid-template-columns: 76px minmax(0, 1fr) 320px;
```

- Left: icon nav rail, 76px, right border only
- Center: main workspace, flexible, right border only
- Right: insight panel, 320px, no border (page edge)

## 2. Color

| Token       | Hex       | Role                                                                                                  |
| ----------- | --------- | ----------------------------------------------------------------------------------------------------- |
| Surface     | `#F8F6F2` | Page/app background                                                                                   |
| Ink         | `#111111` | Primary text, active nav state, primary buttons                                                       |
| Ink-soft    | `#222222` | Secondary emphasis text (unselected filter labels)                                                    |
| Body muted  | `#3a3a3a` | Stat-tile supporting text                                                                             |
| Slate       | `#77736D` | Secondary/metadata text                                                                               |
| Slate-light | `#9B968E` | Placeholder text                                                                                      |
| Line        | `#E3E0DA` | Borders, dividers                                                                                     |
| Control     | `#ECE9E3` | Search bar, inactive pill/button backgrounds                                                          |
| Teal        | `#0E8074` | Positive/progress signal — hero banner fill, "mastered" state, progress bar fill, upward trend arrows |
| Amber       | `#D98E2B` | Attention/urgent signal only — weak-concept %, "behind pace," notification dot. Never decorative.     |

Subject/category tile pastels (used for stat tiles and continue-learning
badges, not brand decoration — each ties to a specific subject or metric):

| Name     | Hex       | Used for                                  |
| -------- | --------- | ----------------------------------------- |
| Butter   | `#F4DEB4` | "Questions this week" tile, DBMS badge    |
| Sky      | `#C7E3F5` | "Syllabus coverage" tile                  |
| Lavender | `#D0CCF4` | "Mocks completed" tile, avatar background |
| Coral    | `#F4C1C4` | OS badge                                  |
| Mint     | `#BDEBD9` | Algorithms badge                          |

Rule carried over from the earlier system and still in force: teal always
means progress/positive, amber always means due/urgent/weak. Never swap
them for decoration.

## 3. Typography

- **Font:** Inter (Google Fonts), weights 400/500/600/700. One family,
  no separate display face — this system doesn't use the Archivo/Plex
  pairing from the earlier Drafting Table doc.
- **Hero heading:** `clamp(24px, 2.6vw, 34px)`, weight 600, line-height
  1.05.
- **Section headings (h3-equivalent):** ~16px, weight 600, `#111111`.
- **Body/labels:** 14px default, 12px (`text-xs`) for metadata and
  supporting lines.
- No monospace anywhere.

## 4. Radius

- Hero banner, stat tiles, continue-learning cards, concept-list panel:
  **20–24px** (`rounded-[20px]` / `rounded-[24px]`).
- Pills (nav avatar, filter/segment buttons, search bar): fully rounded
  (`rounded-full`).
- No radius at the page/column level (see §1) — square edges, hairline
  dividers.

## 5. Components (as built)

- **Nav rail** — 76px, icons only, active item = solid `#111111` circle
  with white icon, inactive = `#77736D` with `#ECE9E3` hover.
- **Hero banner** — solid `#0E8074` fill, white text, no illustration,
  no CTA button (nothing to sell in a personal tool).
- **Stat tiles** — 3-up grid, pastel fill, value + trend delta (teal =
  up/good, amber = "behind pace"), one supporting line.
- **Continue-learning cards** — white fill, `#E3E0DA` border, a plain
  color-badge with 2-letter subject code (no icon illustration), progress
  bar in `#111111`, percentage below.
- **Concept list with prerequisite gating** — a real lock icon (not
  decorative) on any concept whose prerequisite mastery threshold isn't
  met yet; shows the actual blocking condition as text ("Needs Virtual
  memory ≥ 70%"), never just "locked."
- **Exam-week strip** — 7-day row, today = solid `#111111` circle, "+ Log
  study session" full-width button below it.
- **Pending revision list** — item name, thin progress bar in `#0E8074`,
  percentage.
- **Needs-attention list** — plain text rows, percentage in amber.

## 6. Motion

- Progress bars and stat fills animate once on load (`animate-fill-w`,
  900ms, `cubic-bezier(0.22,1,0.36,1)`), guarded by
  `prefers-reduced-motion`.
- Nothing else animates. No hover-lift, no scroll-triggered motion.

## 7. What's explicitly excluded

Carried over from the reference-map corrections — do not reintroduce:

- 3D illustration objects / decorative hero art
- Sparkle icons or any "AI decoration"
- Social-proof elements (ratings, avatar stacks, friend counts) — this
  is a single-user tool
- Outer colored page frame / floating-card page shadow (see §1)

## 8. Source of truth

`dashboard-demo-v3.html` is the reference implementation. When building
the real Next.js UI in Part 3 onward, port these exact values into
`tailwind.config.ts` / `app/globals.css` — replacing the dark-navy
Drafting Table tokens built in Part 1 — rather than re-deriving them.
