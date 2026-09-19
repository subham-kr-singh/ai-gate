# GATE AI — Dashboard Design System

## 1. Design Intent

GATE AI is a personal adaptive preparation workspace for one engineering student. The dashboard should feel like a premium learning instrument: calm, precise, highly visual, and immediately actionable.

The uploaded reference establishes the primary visual composition:

- soft mint environment around the application
- one large floating application surface
- narrow vertical navigation rail on the left
- large editorial dashboard heading
- compact rounded subject/filter navigation
- colorful two-column learning cards
- dedicated personal-insight column on the right
- generous whitespace
- large rounded corners
- near-black typography
- restrained, purposeful interaction

GATE AI should borrow that visual language without becoming a generic education SaaS template.

The interface must answer, at a glance:

1. What should I study next?
2. What do I currently know?
3. What needs review?
4. What practice should I do now?
5. Am I progressing toward the exam?

The learning engine remains the source of truth for mastery, priority, review, and recommendations. The visual system only makes those decisions easy to understand and act on.

---

## 2. Core Visual Direction

### Overall character

**Premium editorial education dashboard + personal engineering study cockpit.**

The interface should feel:

- modern
- intelligent
- warm
- focused
- optimistic
- tactile
- uncluttered
- information-rich without looking dense

Avoid:

- generic admin dashboards
- excessive glassmorphism
- dark cyberpunk aesthetics
- neon gradients
- excessive shadows
- excessive pills
- dense tables on the home screen
- large marketing-style hero illustrations
- meaningless decorative statistics
- rainbow-colored UI

The uploaded reference is the composition reference. GATE AI's learning model supplies the content and semantics.

---

# 3. Master Desktop Wireframe

At a 1440px desktop viewport, the primary dashboard should follow this composition.

```text
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              MINT PAGE ENVIRONMENT                                   │
│                                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │                            FLOATING APP SURFACE                              │   │
│   │                                                                             │   │
│   │ ┌────────┐  ┌──────────────────────────────────────────┐ ┌────────────────┐ │   │
│   │ │        │  │ TOP BAR                                  │ │                │ │   │
│   │ │        │  │ context                    search  bell │ │ profile / gear │ │   │
│   │ │        │  ├──────────────────────────────────────────┤ │                │ │   │
│   │ │        │  │                                          │ │                │ │   │
│   │ │  NAV   │  │  Keep your                                │ │  preparation   │ │   │
│   │ │  RAIL  │  │  GATE streak alive.                      │ │  activity      │ │   │
│   │ │        │  │                                          │ │                │ │   │
│   │ │  icon  │  │  3 high-priority concepts are ready     │ │  mastery       │ │   │
│   │ │  stack │  │  for today's session.                   │ │                │ │   │
│   │ │        │  │                                          │ │  review queue  │ │   │
│   │ │        │  │  [All] [Algo] [OS] [DBMS] [CN] [COA]   │ │                │ │   │
│   │ │        │  │                                          │ │  weak topics   │ │   │
│   │ │        │  │  ┌──────────────────┐ ┌────────────────┐│ │                │ │   │
│   │ │        │  │  │ Algorithms       │ │ Operating      ││ │  today's plan │ │   │
│   │ │        │  │  │ 78% mastery      │ │ Systems        ││ │                │ │   │
│   │ │        │  │  │ progress         │ │ 64% mastery    ││ │                │ │   │
│   │ │        │  │  └──────────────────┘ └────────────────┘│ │                │ │   │
│   │ │        │  │                                          │ │                │ │   │
│   │ │        │  │  ┌──────────────────┐ ┌────────────────┐│ │                │ │   │
│   │ │        │  │  │ DBMS             │ │ Networks       ││ │                │ │   │
│   │ │        │  │  │ 71% mastery      │ │ 59% mastery    ││ │                │ │   │
│   │ │        │  │  └──────────────────┘ └────────────────┘│ │                │ │   │
│   │ │        │  │                                          │ │                │ │   │
│   │ │        │  │  TODAY'S PRIORITY                       │ │                │ │   │
│   │ │        │  │  ┌────────────────────────────────────┐ │ │                │ │   │
│   │ │        │  │  │ Dynamic Programming                 │ │ │                │ │   │
│   │ │        │  │  │ Knapsack patterns · 54% accuracy   │ │ │                │ │   │
│   │ │        │  │  │ [Practice 12] [Review concept]    │ │ │                │ │   │
│   │ │        │  │  └────────────────────────────────────┘ │ │                │ │   │
│   │ │        │  │                                          │ │                │ │   │
│   │ └────────┘  └──────────────────────────────────────────┘ └────────────────┘ │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Desktop proportions

At approximately 1440px:

```text
Page outer padding:        48px–64px
Maximum app width:         1320px–1380px
Application radius:        28px–32px
Navigation rail:           72px–80px
Main content:              flexible
Right insight panel:       300px–330px
Main/right gap:            24px
Main inner padding:        32px
Card gap:                  16px
Section gap:               28px–36px
```

Primary application grid:

```css
grid-template-columns: 76px minmax(0, 1fr) 320px;
```

The right panel is intentionally substantial but never competes with the main workspace.

---

# 4. Color System

The color system intentionally follows the reference's soft mint + warm neutral atmosphere while adding a restrained technical palette for GATE AI.

## 4.1 Environment

| Token              | Hex       | Usage                                    |
| ------------------ | --------- | ---------------------------------------- |
| `--page-mint`      | `#BFEFDC` | Outer page background                    |
| `--page-mint-deep` | `#A9E6CF` | Optional ambient variation               |
| `--app-surface`    | `#F8F6F2` | Main floating application                |
| `--panel-surface`  | `#F1EEE8` | Right insight panel / secondary surfaces |
| `--card-surface`   | `#FFFDFC` | Neutral cards                            |
| `--ink`            | `#111111` | Primary text                             |
| `--ink-soft`       | `#444444` | Secondary text                           |
| `--ink-muted`      | `#77736D` | Metadata / tertiary text                 |
| `--line`           | `#E3E0DA` | Borders and separators                   |
| `--control`        | `#ECE9E3` | Search, inactive filters, quiet controls |

## 4.2 GATE AI semantic colors

Pastel colors are assigned to subjects and learning states. They are not arbitrary decoration.

| Semantic role | Hex       | Usage                                     |
| ------------- | --------- | ----------------------------------------- |
| Coral         | `#F4C1C4` | Algorithms, priority, high-focus practice |
| Lavender      | `#D0CCF4` | Operating Systems                         |
| Butter        | `#F4DEB4` | DBMS                                      |
| Mint          | `#BDEBD9` | Computer Networks                         |
| Sky           | `#C7E3F5` | Computer Organization                     |
| Peach         | `#F4D0B8` | Programming / Data Structures             |
| Soft Yellow   | `#F2E7AE` | Mathematics / Aptitude                    |
| Rose          | `#EFC9D9` | Weak concepts / review                    |
| Teal          | `#0E8074` | Positive progress / completed action      |
| Amber         | `#D98E2B` | Due / urgent / attention-required state   |

### Color rules

1. Pastels belong mainly to large surfaces and cards.
2. Do not use saturated colors for ordinary text.
3. Teal means progress or confirmed positive action.
4. Amber means urgency or review due.
5. Red is not the default error/weakness color.
6. A weak concept should look calm but noticeable.
7. Never place all subject colors on the screen simultaneously if they reduce visual hierarchy.
8. The selected navigation/filter state uses near-black, not a subject color.

---

# 5. Typography

## Primary typeface

Use:

```text
Inter
```

Fallback:

```text
ui-sans-serif,
system-ui,
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
sans-serif
```

The typography should be clean, highly legible, and slightly editorial.

## Scale

| Element        |    Size |  Weight | Line height |
| -------------- | ------: | ------: | ----------: |
| Dashboard hero | 48–60px | 500–600 |   0.98–1.05 |
| Page title     | 32–40px |     600 |        1.05 |
| Section title  | 22–28px |     600 |        1.15 |
| Card title     | 17–20px |     600 |         1.2 |
| Body           | 14–16px |     400 |        1.45 |
| Metadata       | 11–13px |     500 |        1.25 |
| Micro label    | 10–11px |     600 |         1.2 |

The hero should be large and calm rather than loud.

Avoid:

- all-caps section headings
- decorative serif typography
- excessive bold
- monospace for ordinary statistics
- marketing slogans

---

# 6. Application Shell

Component structure:

```text
<AppShell>
  <SidebarRail />

  <MainWorkspace>
    <TopBar />
    <DashboardHero />
    <SubjectFilter />
    <SubjectGrid />
    <TodayPriority />
    <ContinueLearning />
  </MainWorkspace>

  <RightInsightPanel />
</AppShell>
```

The shell should feel like one physical application surface floating inside the mint environment.

---

# 7. Outer Page Environment

The browser/page background is intentionally visible around the application.

```css
background: #bfefdc;
```

The application surface:

```css
background: #f8f6f2;
border-radius: 30px;
```

Optional ambient treatment:

```text
soft mint background
+
very subtle tonal variation
+
no obvious gradient
```

Do not use a heavy background image.

The page should feel almost like a premium physical sheet or dashboard placed on a mint desk.

---

# 8. Left Navigation Rail

The rail is narrow and vertical, inspired directly by the reference.

```text
┌────────┐
│  logo  │
│        │
│  Home  │
│  Study │
│ Practice
│  Tests │
│ Review │
│Analytics
│        │
│   ⚙    │
│        │
│ avatar │
└────────┘
```

## Rail

```text
Width: 72–80px
Background: #F1EEE8
Radius: 20–24px
Padding: 12px
```

Icons use Lucide.

Recommended navigation:

1. Home
2. Study
3. Practice
4. Tests
5. Review
6. Analytics
7. Calendar
8. Settings

## Active state

```css
background: #111111;
color: #ffffff;
border-radius: 999px;
```

Active icons should be immediately recognizable.

Inactive items are quiet:

```css
color: #77736d;
```

Do not place text labels permanently beside every icon on desktop.

Tooltips appear on hover/focus.

---

# 9. Brand Mark

The GATE AI mark should be compact and geometric.

Recommended direction:

```text
small abstract "G" / gate / aperture symbol
+
GATE AI wordmark
```

The logo should be black or very dark neutral.

Do not use a colorful AI brain, robot, sparkle, or generic graduation-cap icon.

---

# 10. Top Bar

The top bar is minimal.

```text
[ GATE / Dashboard ]                         [ search ] [ bell ] [ avatar ]
```

Suggested height:

```text
52–60px
```

Search control:

```text
width: 220–280px
height: 40–42px
background: #ECE9E3
border-radius: 999px
```

Placeholder:

```text
Search topics, concepts, questions...
```

Search can expand on focus.

Do not make search visually dominant.

---

# 11. Dashboard Hero

The hero follows the reference's editorial heading treatment.

Example:

```text
Keep your
GATE streak alive.
```

Supporting line:

```text
3 high-priority concepts are ready for today's session.
```

Alternative dynamic copy:

```text
Your next target is clear.
```

or:

```text
Make today's study count.
```

The copy should be generated from real learning state where possible.

The hero must not become a generic marketing banner.

### Hero layout

```text
┌─────────────────────────────────────────────┐
│                                             │
│ Keep your                                   │
│ GATE streak alive.                          │
│                                             │
│ 3 high-priority concepts are ready...       │
│                                             │
└─────────────────────────────────────────────┘
```

Do not fill the hero with five KPI tiles.

---

# 12. Subject Filter

Immediately below the hero:

```text
[ All ] [ Algorithms ] [ OS ] [ DBMS ] [ Networks ]
[ COA ] [ Programming ] [ Mathematics ]
```

Pills:

```text
height: 40–44px
padding: 0 16px
border-radius: 999px
```

Selected:

```text
background: #111111
color: #FFFFFF
```

Unselected:

```text
background: #ECE9E3
color: #222222
```

The filter row scrolls horizontally on smaller screens.

The filter is navigation, not decoration.

---

# 13. Primary Subject Cards

Use a two-column grid on desktop.

```css
grid-template-columns: repeat(2, minmax(0, 1fr));
gap: 16px;
```

Each card:

```text
minimum height: 165px
padding: 20–24px
border-radius: 20–24px
```

Example:

```text
┌─────────────────────────────────────────────┐
│ ◉ Algorithms                         78%    │
│                                             │
│ Data Structures & Algorithms                │
│                                             │
│ 18 concepts · 142 questions                 │
│                                             │
│ Strong: Trees · Sorting                     │
│ Needs work: Dynamic Programming             │
│                                             │
│ ███████████████░░░                          │
└─────────────────────────────────────────────┘
```

Each card should communicate:

- subject
- mastery
- coverage
- question volume
- strongest area
- weak area when meaningful
- next useful action

## Card color assignment

Algorithms:

```text
#F4C1C4
```

Operating Systems:

```text
#D0CCF4
```

DBMS:

```text
#F4DEB4
```

Networks:

```text
#BDEBD9
```

COA:

```text
#C7E3F5
```

Programming:

```text
#F4D0B8
```

Mathematics:

```text
#F2E7AE
```

Use the colors consistently throughout the product.

---

# 14. Subject Card Interaction

Cards are clickable.

Hover:

```text
slight background darkening
```

Do not use:

```text
large upward movement
large shadow
glow
gradient
```

Focus:

```text
2px accessible focus ring
```

Click opens the subject workspace.

---

# 15. Progress Visualization

Use thin progress bars rather than oversized circular percentages on subject cards.

Example:

```text
Mastery 78%

██████████████████░░░░
```

Progress track:

```text
rgba(17,17,17,0.10)
```

Fill:

```text
#111111
```

Semantic alternative:

```text
#0E8074
```

Use the accent only when it communicates positive state.

---

# 16. Today's Priority

This is the most important adaptive surface on the main dashboard.

Use a larger card below the subject grid.

```text
┌──────────────────────────────────────────────────────────────┐
│ TODAY'S PRIORITY                                             │
│                                                              │
│ Dynamic Programming                                          │
│ Knapsack patterns                                            │
│                                                              │
│ Recent accuracy dropped from 71% → 54%.                     │
│                                                              │
│ [ Practice 12 questions ]     [ Review concept ]             │
└──────────────────────────────────────────────────────────────┘
```

Recommended background:

```text
#F4C1C4
```

The priority card should be generated from actual learning state.

It should explain:

- what needs attention
- why it needs attention
- what action to take
- how much work is expected

Never invent a recommendation merely to populate the UI.

---

# 17. Priority Spine

For lists such as:

- Today's plan
- Review queue
- mistakes
- weak concepts
- planner

use a subtle 3px vertical priority indicator.

```text
│ item
│ item
│ item
```

Semantic colors:

```text
Teal  = on track / recommended
Amber = due / urgent
Slate = deferred / low priority
Rose  = weak learning state
```

This is preferred over filling every item with a badge.

---

# 18. Continue Learning

Place below Today's Priority.

```text
Continue learning                              View all

┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ OS           │ │ DBMS         │ │ Algorithms   │
│ Processes    │ │ Transactions │ │ Graphs       │
│              │ │              │ │              │
│ 62%          │ │ 84%          │ │ 48%          │
│ Resume       │ │ Resume       │ │ Resume       │
└──────────────┘ └──────────────┘ └──────────────┘
```

These cards are intentionally more compact than subject cards.

They answer:

```text
Where did I stop?
```

not:

```text
What is my overall performance?
```

---

# 19. Right Insight Panel

The right column converts the reference's personal/activity area into a GATE AI learning cockpit.

```text
Width: 300–330px
Background: #F0EDE7
Radius: 22–24px
Padding: 20–24px
```

Sections:

1. Profile
2. Preparation activity
3. Mastery
4. Review queue
5. Weak concepts
6. Today's plan
7. Preparation snapshot

The right panel remains visually quieter than the main workspace.

---

# 20. Profile Header

```text
┌────────────────────────────────┐
│ ○ avatar                   ⚙   │
│                                │
│ Welcome back                   │
│ Your GATE workspace            │
└────────────────────────────────┘
```

The avatar should be small.

The profile should not become a social profile.

Do not show:

- follower counts
- friends
- likes
- social feeds

This is a personal learning instrument.

---

# 21. Preparation Activity

Reference-inspired compact chart:

```text
Preparation

3h 25m
This week

▂ ▅ ▃ ▆ ▇ ▄ ▇
M T W T F S S
```

Possible metrics:

- study minutes
- questions solved
- accuracy
- current streak

Use a compact bar chart.

Avoid a full analytics visualization on the dashboard.

---

# 22. Mastery Ring

Use one prominent mastery ring.

```text
        ╭────────╮
       │   68%    │
       │ Mastery  │
        ╰────────╯
```

The ring is the primary bold visualization of the interface.

Track:

```text
#DDD9D2
```

Progress:

```text
#111111
```

Optional urgency segment:

```text
#D98E2B
```

Supporting dimensions:

```text
Accuracy       72%
Retention      64%
Coverage       81%
Consistency    59%
```

The aggregate must be explainable from learning-engine data.

Do not make mastery a black-box number.

---

# 23. Review Queue

```text
Review today

◉ Normalization in DBMS       12m
◉ Deadlock detection           8m
◉ TCP congestion control      15m
```

Each item contains:

- concept
- estimated time
- urgency
- action

Clicking opens the relevant review session.

---

# 24. Weak Concepts

```text
Needs attention

Dynamic Programming        54%
Computer Networks           61%
SQL / Relational Algebra    63%
```

Use muted semantic colors.

Do not use aggressive red unless there is an actual destructive/error condition.

Weakness is a learning state, not a failure state.

---

# 25. Today's Plan

The plan should recommend what to work on without feeling like a rigid timetable.

```text
Today's plan

Review
Dynamic Programming
20 min

Practice
Graph Algorithms
25 questions

Learn
TCP Congestion Control
30 min

Recall
DBMS normalization
10 min
```

The plan should be adaptive.

Do not create hourly scheduling by default.

---

# 26. Practice Session Card

When a practice session is recommended:

```text
┌────────────────────────────────────────────┐
│ Practice session                           │
│                                            │
│ Algorithms                                 │
│ Graphs · Medium                            │
│                                            │
│ 15 questions                               │
│ ~20 minutes                                │
│                                            │
│ [ Start practice ]                         │
└────────────────────────────────────────────┘
```

Primary action should be obvious.

Use black for primary action.

---

# 27. Dashboard Information Hierarchy

The eye should move in this order:

```text
1. Hero / current context
        ↓
2. Today's Priority
        ↓
3. Subject mastery
        ↓
4. Continue learning
        ↓
5. Personal insight panel
```

The right panel can be scanned independently.

Do not make every section equally visually loud.

---

# 28. Card Geometry

The reference uses very rounded geometry.

GATE AI should preserve that, but with a hierarchy.

```text
Application:        28–32px
Major panels:       22–24px
Learning cards:     20–24px
Small cards:        16–20px
Pills:              999px
Buttons:            12–14px
Inputs:             12–14px
Avatar:             999px
```

Avoid nesting excessive rounded containers inside rounded containers.

A card inside a card should be rare.

---

# 29. Shadows

Use shadows sparingly.

Application surface:

```text
0 18px 50px rgba(20, 40, 30, 0.08)
```

Cards:

```text
none
```

Optional hover:

```text
0 6px 18px rgba(20, 30, 25, 0.06)
```

Never use:

- giant soft shadows
- glowing shadows
- colored shadows
- neumorphism

The mint environment should provide most of the depth.

---

# 30. Borders

Default border:

```text
1px solid #E3E0DA
```

Use borders mainly for:

- controls
- panel separation
- empty states
- selected-but-not-filled states
- data visualization tracks

Do not put borders around every element.

---

# 31. Icons

Use Lucide icons consistently.

Recommended:

```text
Home
BookOpen
Brain
ClipboardCheck
BarChart3
CalendarDays
Settings
Search
Bell
ChevronRight
Clock3
Target
CircleCheck
AlertCircle
RotateCcw
Play
```

Rules:

- 16px for compact controls
- 18–20px for navigation
- 20–24px for card identity
- stroke width around 1.8–2px
- never mix filled and outlined icon families casually

Icons support meaning; they do not decorate empty space.

---

# 32. Avatar

The reference includes small circular user avatars.

GATE AI should use one personal avatar.

```text
36–40px desktop
32–36px compact
```

If no image exists, use a simple monogram.

Do not generate random profile imagery.

---

# 33. Responsive Design

## Desktop

```text
>= 1200px

76px rail
main content
320px insight panel
```

## Tablet

```text
768–1199px

72px rail
main content
right panel collapses below content
```

The right panel becomes a stacked section after the main dashboard.

## Mobile

```text
< 768px
```

Use:

```text
top header
content
bottom navigation
```

Bottom navigation:

```text
┌─────────────────────────────────────────┐
│ Home  Study  Practice  Review  Profile │
└─────────────────────────────────────────┘
```

The right insight panel becomes expandable sections.

Subject cards become one column.

Today's Priority remains near the top.

Hero becomes:

```text
36–44px
```

Filter pills remain horizontally scrollable.

---

# 34. Mobile Wireframe

```text
┌───────────────────────────────┐
│ GATE AI              🔔  ○    │
│                               │
│ Keep your                     │
│ GATE streak alive.            │
│                               │
│ [All][Algo][OS][DBMS] →       │
│                               │
│ ┌───────────────────────────┐ │
│ │ TODAY'S PRIORITY          │ │
│ │ Dynamic Programming       │ │
│ │ Knapsack patterns         │ │
│ │                           │ │
│ │ [Practice 12 questions]  │ │
│ └───────────────────────────┘ │
│                               │
│ Algorithms             78%    │
│ ┌───────────────────────────┐ │
│ │ Data Structures & Algo    │ │
│ │ ███████████████░░         │ │
│ └───────────────────────────┘ │
│                               │
│ Operating Systems       64%   │
│ ┌───────────────────────────┐ │
│ │ Processes & Memory        │ │
│ └───────────────────────────┘ │
│                               │
│ Continue learning             │
│ [OS] [DBMS] [Graphs]          │
│                               │
├───────────────────────────────┤
│ Home Study Practice Review Me │
└───────────────────────────────┘
```

---

# 35. Dashboard States

## First-time state

Do not show fake analytics.

Show:

```text
Build your first learning signal.

Complete a short study session or practice set.
GATE AI will use your results to build your
first mastery picture.
```

Primary action:

```text
Start study
```

## Active learner

Show:

- real mastery
- real review queue
- real weak concepts
- real priority
- real recent activity

## No review due

```text
No reviews due today.

Your current queue is clear.
```

Do not use:

```text
Oops! Nothing here yet 👀
```

## Error

```text
We couldn't load today's learning state.

Try again.
```

Keep error language direct and calm.

---

# 36. Motion

Motion is restrained.

Allowed:

- filter selection
- progress updates
- button press feedback
- panel expansion
- mastery ring initial fill
- test timer updates
- list insertion/removal after an action

Not allowed:

- scroll-triggered animation on every section
- floating cards
- perpetual animated gradients
- excessive bounce
- hover-lift on every card

Mastery ring:

```text
animate once on initial render
duration: 700–900ms
ease: ease-out
```

Respect:

```text
prefers-reduced-motion
```

---

# 37. Interaction Principles

Every important surface should have a clear next action.

Good:

```text
Practice 12 questions
Review concept
Resume
Start test
Review mistakes
```

Avoid:

```text
Explore
Discover
Learn more
Get started
View →
Continue →
```

The UI should say what happens after the click.

---

# 38. Data Truthfulness

The dashboard must never manufacture learning metrics.

Every visible metric should come from the learning system:

```text
mastery
coverage
accuracy
retention
review due
mistakes
study time
question counts
priority
```

The visual layer must not infer a student's knowledge from appearance, time spent alone, or arbitrary thresholds.

If data is unavailable, show an honest empty/loading state.

---

# 39. Dashboard Content Mapping

| UI surface              | Learning-engine source                |
| ----------------------- | ------------------------------------- |
| Subject mastery         | Subject / concept mastery aggregation |
| Coverage                | Concept completion / coverage state   |
| Today's priority        | Priority engine                       |
| Review queue            | Revision service / review state       |
| Weak concepts           | Learning state + mistake history      |
| Today's plan            | Planner                               |
| Practice recommendation | DPP / recommendation engine           |
| Preparation activity    | Study sessions                        |
| Accuracy                | Attempts / answers                    |
| Retention               | Retention model / review history      |
| Streak                  | Study-session history                 |

The architecture already treats the learning engine as the authoritative decision system; the dashboard is its visual interface.

---

# 40. Subject Navigation

The subject filter and subject cards should represent the actual syllabus.

Primary subjects:

```text
Discrete & Engineering Mathematics
Theory of Computation
Digital Logic
Computer Organization & Architecture
Programming & Data Structures
Algorithms
Compiler Design
Operating Systems
Databases
Computer Networks
```

The dashboard may abbreviate labels visually:

```text
Mathematics
TOC
Digital Logic
COA
Programming
Algorithms
Compiler
OS
DBMS
Networks
```

The full syllabus remains available in the syllabus workspace.

---

# 41. Dashboard Density

Target:

```text
high information value
+
low visual noise
```

A user should understand the dashboard within approximately 5 seconds.

The first viewport should not require scrolling to find:

- today's priority
- subject progress
- next action

Secondary details may appear below.

---

# 42. Visual Rhythm

Use a repeated rhythm inspired by the reference:

```text
large heading
        ↓
small explanatory line
        ↓
horizontal filter row
        ↓
2-column colorful card grid
        ↓
larger adaptive priority card
        ↓
compact continuation cards
```

The right column mirrors the rhythm:

```text
profile
        ↓
activity
        ↓
mastery
        ↓
review
        ↓
weak concepts
        ↓
plan
```

This creates a predictable visual cadence without looking like a template.

---

# 43. What Makes GATE AI Distinct

The reference could represent any education product.

GATE AI becomes distinctive through its learning intelligence:

```text
subject
  ↓
unit
  ↓
topic
  ↓
concept
  ↓
evidence
  ↓
mastery
  ↓
mistakes
  ↓
priority
  ↓
next action
```

The dashboard should make this loop visible without explaining the entire architecture to the learner.

---

# 44. Design Anti-Patterns

Do not introduce these later:

### Generic SaaS cards

```text
white card
12px radius
soft shadow
icon
title
subtitle
```

repeated 20 times.

### Dashboard KPI wall

```text
74%
68%
82%
59%
91%
```

with no action attached.

### Rainbow UI

Every subject does not need a different saturated brand color.

### Excessive pills

Pills are for filters and compact status controls, not every label.

### Decorative gradients

No gradient should exist merely because it looks modern.

### AI decoration

Do not use:

- sparkle icons everywhere
- glowing neural-network backgrounds
- robot illustrations
- magic wand buttons

AI should be experienced through useful behavior.

### Fake productivity language

Avoid:

```text
Crush your goals!
Level up!
You're unstoppable!
```

Use precise learning language instead.

---

# 45. Accessibility

Minimum requirements:

- WCAG AA contrast for text
- visible keyboard focus
- semantic buttons/links
- `aria-label` for icon-only controls
- keyboard-accessible horizontal filters
- reduced-motion support
- progress values exposed semantically
- no information conveyed only by color
- touch targets at least 44px on mobile

Pastel backgrounds must always use sufficiently dark text.

---

# 46. Component Inventory

Suggested component structure:

```text
components/
├── dashboard/
│   ├── DashboardHero
│   ├── SubjectFilter
│   ├── SubjectCard
│   ├── SubjectGrid
│   ├── TodayPriority
│   ├── ContinueLearning
│   ├── PreparationActivity
│   ├── MasteryRing
│   ├── ReviewQueue
│   ├── WeakConceptList
│   └── TodayPlan
│
├── navigation/
│   ├── SidebarRail
│   ├── BottomNavigation
│   └── TopBar
│
└── ui/
    ├── Button
    ├── Input
    ├── ProgressBar
    ├── Pill
    ├── Avatar
    ├── IconButton
    ├── Divider
    └── Skeleton
```

All components consume shared design tokens.

Do not scatter raw hex values through component files.

---

# 47. CSS Token Reference

```css
:root {
  --page-mint: #bfefdc;
  --page-mint-deep: #a9e6cf;

  --app-surface: #f8f6f2;
  --panel-surface: #f1eee8;
  --card-surface: #fffdfc;
  --control-surface: #ece9e3;

  --ink: #111111;
  --ink-soft: #444444;
  --ink-muted: #77736d;

  --line: #e3e0da;

  --coral: #f4c1c4;
  --lavender: #d0ccf4;
  --butter: #f4deb4;
  --mint: #bdebd9;
  --sky: #c7e3f5;
  --peach: #f4d0b8;
  --yellow: #f2e7ae;
  --rose: #efc9d9;

  --teal: #0e8074;
  --amber: #d98e2b;

  --radius-app: 30px;
  --radius-panel: 24px;
  --radius-card: 22px;
  --radius-control: 12px;
  --radius-pill: 999px;
}
```

---

# 48. Final Visual Rule

When adding any new UI element, ask:

```text
Does this help the student understand
what they know or what they should do next?
```

If not, remove it.

The dashboard should feel like:

```text
a premium personal study desk
+
a learning instrument
+
an adaptive command center
```

not:

```text
a generic SaaS dashboard
+
a marketing page
+
an AI-themed template
```

The uploaded reference defines the visual composition and emotional tone. GATE AI's learning engine defines what the interface actually means.
