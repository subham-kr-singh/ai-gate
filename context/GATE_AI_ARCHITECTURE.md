# GATE AI --- Personal Adaptive GATE Preparation Engine

**Document:** `GATE_AI_ARCHITECTURE.md`\
**Version:** 2.0\
**Status:** Architecture / implementation blueprint\
**Target:** Personal GATE CSE/IT preparation\
**Users:** One learner --- the developer/student\
**Primary stack:** Next.js + TypeScript + PostgreSQL/pgvector + Prisma +
Inngest + Vercel AI SDK

------------------------------------------------------------------------

## 1. Purpose

This document is the implementation-level architecture for a **personal
adaptive GATE preparation engine**.

The product is not merely:

-   a question bank,
-   mock-test website,
-   syllabus tracker,
-   planner,
-   analytics dashboard,
-   RAG application,
-   or AI chatbot.

Those are components.

The actual product is the learning loop:

``` text
Study
  ↓
Practice
  ↓
Observe performance
  ↓
Analyze mistakes
  ↓
Update learning state
  ↓
Determine priority
  ↓
Generate next useful action
  ↓
Study again
  ↺
```

The system should continuously answer:

1.  What have I covered?
2.  What do I actually know?
3.  What am I forgetting?
4.  What mistakes keep recurring?
5.  Which prerequisite is blocking me?
6.  What should I work on next?
7.  Am I progressing appropriately for the remaining exam time?
8.  Did the previous intervention improve performance?

The most important principle is:

> **Build the GATE-specific learning intelligence; reuse existing
> software for generic infrastructure.**

------------------------------------------------------------------------

# 2. Single-User Context

This is a personal system, not a public SaaS product.

That changes the engineering priorities.

## Optimize for

-   correctness,
-   explainability,
-   low maintenance,
-   fast iteration,
-   rich historical learning data,
-   experimentation,
-   low infrastructure cost,
-   simple deployment.

## Do not optimize prematurely for

-   millions of users,
-   multi-region infrastructure,
-   tenant isolation,
-   billing,
-   enterprise roles,
-   distributed microservices,
-   horizontal scaling,
-   dedicated ML infrastructure.

A modular monolith is the correct starting architecture.

If the project later becomes multi-user, the domain boundaries provide a
reasonable migration path.

------------------------------------------------------------------------

# 3. No Custom ML Model in V1

The system does **not** require custom ML training.

Use:

``` text
LLM
+
deterministic TypeScript
+
statistics
+
FSRS
+
concept graph
+
historical learning data
```

The LLM handles language-oriented work:

-   conversation,
-   study-session interpretation,
-   structured extraction,
-   mistake classification,
-   explanations,
-   hints,
-   concept extraction,
-   question tagging,
-   resource summarization,
-   grounded tutoring.

Application code handles authoritative decisions:

-   GATE grading,
-   answer correctness,
-   marks,
-   mastery,
-   retention,
-   revision scheduling,
-   DPP selection,
-   priority,
-   planner state,
-   unit completion,
-   analytics.

### Golden rule

``` text
LLM
 ↓
structured proposal
 ↓
Zod validation
 ↓
domain service
 ↓
database
```

Never:

``` text
LLM
 ↓
direct database mutation
```

The LLM is the flexible intelligence/interface. The learning engine is
the decision system. PostgreSQL is the source of truth.

------------------------------------------------------------------------

# 4. Product Philosophy

## 4.1 Evidence over assumptions

Never infer mastery merely from:

``` text
"I studied this."
```

Use evidence:

-   question accuracy,
-   PYQ accuracy,
-   difficulty,
-   response time,
-   confidence,
-   repeated mistakes,
-   retention,
-   revision history,
-   recent performance,
-   prerequisite performance.

------------------------------------------------------------------------

## 4.2 Deterministic systems before AI

If a task can be reliably performed by code, use code.

### Deterministic

-   GATE marking,
-   answer checking,
-   test state,
-   syllabus completion,
-   mastery calculation,
-   retention calculation,
-   revision queue,
-   DPP composition,
-   question selection,
-   planner,
-   analytics,
-   pace calculation.

### AI-assisted

-   explanations,
-   hints,
-   concept extraction,
-   question tagging,
-   mistake classification,
-   misconception identification,
-   natural-language study-session parsing,
-   resource summarization,
-   grounded tutoring.

------------------------------------------------------------------------

## 4.3 AI explains; it does not own the decision

Preferred:

``` text
Student data
    ↓
Learning Engine
    ↓
Recommendation Engine
    ↓
Recommended action
    ↓
LLM
    ↓
Natural-language explanation
```

Not:

``` text
Student data
    ↓
LLM
    ↓
"What should I study?"
```

The first design is reproducible, testable, and debuggable.

------------------------------------------------------------------------

## 4.4 Every recommendation should be measurable

Store:

``` text
recommendation
reason
intervention
beforeState
afterState
outcome
```

Example:

``` text
Recommendation:
Review conflict serializability.

Before:
Mastery = 43%

Intervention:
20-minute review
+ 8 questions
+ 2 previous mistakes

After:
Mastery = 68%
```

This allows the system to eventually evaluate whether recommendations
are actually helping.

------------------------------------------------------------------------

# 5. User's Study Philosophy

The student already has a study approach.

For each subject:

``` text
Subject
 ├── Unit 1
 ├── Unit 2
 ├── Unit 3
 ├── Unit 4
 └── Unit 5
```

Target:

> Approximately one unit per day when possible.

This is **not a hard deadline**.

A difficult unit may require:

``` text
1 day
2 days
3 days
```

The system must learn actual personal velocity rather than punish
deviations from an estimate.

The planner should tell the student:

``` text
What to work on
```

not:

``` text
When to study it
```

Do not build an hourly timetable unless explicitly desired later.

The exam date/countdown is still important because remaining time
affects priorities.

------------------------------------------------------------------------

# 6. High-Level Architecture

``` text
                              ┌─────────────────┐
                              │     STUDENT     │
                              └────────┬────────┘
                                       │
                            Study / Practice / Chat
                                       │
                                       ▼
                              ┌─────────────────┐
                              │    Next.js      │
                              │ UI + API + PWA  │
                              └────────┬────────┘
                                       │
             ┌─────────────────────────┼──────────────────────────┐
             │                         │                          │
             ▼                         ▼                          ▼
      ┌──────────────┐        ┌────────────────┐        ┌──────────────┐
      │ Test Engine  │        │ Learning Engine│        │ AI Service   │
      └──────┬───────┘        └───────┬────────┘        └──────┬───────┘
             │                        │                        │
             ▼                        ▼                        ▼
         Attempts               Learning State                 RAG
             │                        │                        │
             └────────────────────────┼────────────────────────┘
                                      ▼
                             ┌────────────────────┐
                             │ PostgreSQL         │
                             │ + pgvector + FTS   │
                             └──────────┬─────────┘
                                        │
                ┌───────────────────────┼────────────────────────┐
                │                       │                        │
                ▼                       ▼                        ▼
          Question Bank           Learning Data            Resource KB
                                                                 │
                                                                 ▼
                                                      ┌───────────────────┐
                                                      │ Ingestion Pipeline│
                                                      └─────────┬─────────┘
                                                                │
                                                     ┌──────────┼──────────┐
                                                     ▼          ▼          ▼
                                                    PDF        Web       GitHub
                                                     │          │          │
                                                     └──────────┼──────────┘
                                                                ▼
                                                        Parse → Normalize
                                                                ↓
                                                         Classify → Chunk
                                                                ↓
                                                            Embeddings
                                                                ↓
                                                             pgvector
```

Background work is handled by Inngest. Large source files are kept in
object storage.

------------------------------------------------------------------------

# 7. Core Learning Loop

``` text
                  ┌───────────────┐
                  │     STUDY     │
                  └───────┬───────┘
                          ↓
                  ┌───────────────┐
                  │    PRACTICE   │
                  └───────┬───────┘
                          ↓
                  ┌───────────────┐
                  │    ATTEMPT    │
                  └───────┬───────┘
                          ↓
                  ┌───────────────┐
                  │    ANALYZE    │
                  └───────┬───────┘
                          ↓
              ┌───────────┴───────────┐
              ▼                       ▼
        ┌────────────┐          ┌────────────┐
        │   MASTERY  │          │   MISTAKE  │
        └─────┬──────┘          └─────┬──────┘
              └───────────┬───────────┘
                          ↓
                ┌──────────────────┐
                │ UPDATE LEARNING  │
                │      STATE       │
                └────────┬─────────┘
                         ↓
                ┌──────────────────┐
                │ PRIORITY ENGINE  │
                └────────┬─────────┘
                         ↓
                ┌──────────────────┐
                │   NEXT TARGET    │
                └────────┬─────────┘
                         ↓
                ┌──────────────────┐
                │ DPP / REVIEW /   │
                │ PRACTICE / TEST  │
                └────────┬─────────┘
                         ↓
                       STUDY
                         ↺
```

This loop is the actual product.

------------------------------------------------------------------------

# 8. Technology Stack

## Core

-   Next.js
-   TypeScript
-   Prisma
-   PostgreSQL
-   pgvector

## AI

-   Vercel AI SDK
-   replaceable LLM provider
-   embeddings provider

## Learning

-   custom TypeScript learning engine
-   `ts-fsrs`

## Documents

-   LlamaIndex LiteParse
-   LlamaParse/cloud parsing only for difficult documents

## GitHub

-   Octokit

## Jobs

-   Inngest

## Validation

-   Zod

## Client state

-   TanStack Query
-   Zustand

## Offline

-   Dexie / IndexedDB

## UI

-   Tailwind
-   shadcn/ui
-   Radix
-   Lucide

## Math

-   KaTeX

## Storage

-   S3-compatible object storage / Backblaze B2

## Testing

-   Vitest
-   Testing Library
-   Playwright

## Monitoring

-   Sentry

## Optional product analytics

-   PostHog

------------------------------------------------------------------------

# 9. What You Build vs Reuse

## Build yourself

These are the project's real domain value:

1.  GATE syllabus model
2.  Subject/unit/topic/concept hierarchy
3.  Concept dependency graph
4.  Question model
5.  GATE grading rules
6.  Attempt model
7.  Mistake model
8.  Learning state
9.  Mastery logic
10. Retention logic
11. Unit completion evaluator
12. Priority engine
13. DPP selector
14. Adaptive planner
15. Resource-to-concept mapping
16. GATE-specific retrieval/ranking
17. Recommendation evaluation

## Reuse

Do not reinvent:

-   authentication,
-   validation,
-   form handling,
-   server-state management,
-   IndexedDB,
-   spaced repetition,
-   GitHub API,
-   PDF parsing,
-   AI streaming,
-   background jobs,
-   UI primitives.

------------------------------------------------------------------------

# 10. GATE Knowledge Model

The syllabus hierarchy:

``` text
Exam
 ↓
Subject
 ↓
Unit
 ↓
Topic
 ↓
Subtopic
 ↓
Concept
 ↓
Skill
```

Example:

``` text
DBMS
└── Transactions
    ├── Serializability
    │   ├── Conflict Serializability
    │   ├── View Serializability
    │   └── Precedence Graph
    ├── Concurrency Control
    │   ├── Two Phase Locking
    │   ├── Timestamp Ordering
    │   └── Lock Compatibility
    └── Recovery
        ├── Logging
        ├── Checkpoints
        └── WAL
```

The exact syllabus should be versioned by examination year and
maintained from the relevant official source.

Do not permanently hard-code assumptions about future GATE changes.

------------------------------------------------------------------------

# 11. Concept Dependency Graph

Concepts can have prerequisite relationships:

``` text
Lock Compatibility
       ↓
Two Phase Locking
       ↓
Conflict Serializability
       ↓
Precedence Graph
```

This lets the recommendation engine distinguish:

-   direct weakness,
-   prerequisite weakness,
-   downstream weakness.

If the student repeatedly fails a downstream concept, investigate
prerequisites before simply assigning more difficult questions.

------------------------------------------------------------------------

# 12. Student Learning State

Do not use one score to represent knowledge.

Track:

``` text
completion
mastery
retention
confidence
accuracy
recentAccuracy
attemptCount
correctCount
averageTime
expectedTime
lastSeen
nextReview
mistakeCount
pyqAccuracy
```

Example:

``` text
Concept: Conflict Serializability

Completion:       100%
Mastery:           43%
Retention:         51%
Confidence:        68%
Accuracy:          52%
Recent Accuracy:   33%
Attempts:          18
Average Time:      118 sec
Expected Time:      75 sec
Last Seen:          4 days ago
PYQ Accuracy:       40%
Mistakes:            7
```

------------------------------------------------------------------------

# 13. Completion vs Mastery

## Completion

Exposure to the material.

Possible states:

``` text
NOT_STARTED
LEARNING
STUDIED
PRACTICING
PROVISIONALLY_COMPLETE
MASTERED
```

## Mastery

Evidence that the student can reliably solve relevant problems.

Reading is not mastery.

A unit should not become complete simply because one day was spent on
it.

------------------------------------------------------------------------

# 14. Mastery Algorithm

Start with a transparent statistical model.

A simple exponential moving average:

``` text
mastery_new =
    mastery_old +
    alpha * (result - mastery_old)
```

where:

``` text
result = 1 for correct
result = 0 for incorrect
```

A starting alpha around `0.30` is an engineering parameter, not a
scientific constant.

Later incorporate:

-   difficulty,
-   response time,
-   confidence,
-   question discrimination,
-   PYQ performance,
-   repeated attempts.

Version the implementation:

``` text
masteryAlgorithmVersion = "v1"
```

Never silently change historical calculations.

------------------------------------------------------------------------

# 15. Retention

Mastery and retention are separate.

A simple initial approximation:

``` text
retention =
    mastery * exp(-daysSinceLastSeen / tau)
```

This is an engineering approximation.

Use FSRS for flashcard/review scheduling rather than building a new
spaced-repetition algorithm.

Later evaluate whether a different forgetting model better predicts this
student's actual recall.

------------------------------------------------------------------------

# 16. Confidence

Optional question-level confidence:

``` text
1 = guessed
2 = low confidence
3 = reasonably confident
4 = very confident
```

Useful patterns:

### False confidence

``` text
confidence = 4
correct = false
```

### Underconfidence

``` text
confidence = 1
correct = true
```

These patterns can inform tutoring and metacognitive feedback.

------------------------------------------------------------------------

# 17. Mistake Taxonomy

Use stable categories:

``` text
CONCEPT_GAP
MEMORY_GAP
CALCULATION_ERROR
MISREAD
CARELESS
WRONG_APPROACH
GUESS
TIME_PRESSURE
QUESTION_AMBIGUITY
OTHER
```

The LLM may classify a mistake, but store:

``` text
mistakeType
classificationConfidence
classificationSource
```

The classification is not automatically authoritative.

------------------------------------------------------------------------

# 18. Question Model

A question should contain:

``` text
id
subjectId
unitId
topicId
conceptIds
skillIds

type
marks
difficulty

statement
options
correctAnswer
solution

year
source
sourceUrl
license

status
version
contentHash

createdAt
updatedAt
```

Question types:

``` text
MCQ
MSQ
NAT
```

Future:

``` text
CONCEPT_CHECK
FLASHCARD
NUMERICAL_PRACTICE
```

------------------------------------------------------------------------

# 19. Question Difficulty

Initially use manually assigned difficulty.

Later estimate from:

``` text
successRate
averageTime
attemptCount
discrimination
```

Do not recalibrate with tiny samples.

Store:

``` text
difficultySource
difficultyVersion
difficultyConfidence
```

------------------------------------------------------------------------

# 20. Question Deduplication

Use content hashes for exact duplicates.

Use embeddings for semantic similarity.

Possible outcomes:

``` text
EXACT_DUPLICATE
NEAR_DUPLICATE
RELATED
SAME_CONCEPT
UNRELATED
```

Semantic similarity should not automatically delete a question.

------------------------------------------------------------------------

# 21. GATE Grading Engine

The grading engine is deterministic.

It implements the marking rules applicable to the target GATE exam year.

Store marking configuration by exam year:

``` text
Exam
 └── MarkingScheme
      ├── MCQ
      ├── MSQ
      └── NAT
```

Never use an LLM for final marks.

The server, not the browser, is authoritative.

------------------------------------------------------------------------

# 22. Test Engine

Features:

-   question navigation,
-   answer selection,
-   mark for review,
-   timer,
-   autosave,
-   resume,
-   submission,
-   response-time capture,
-   scoring,
-   result analysis.

------------------------------------------------------------------------

# 23. Autosave

Flow:

``` text
User selects answer
      ↓
UI updates immediately
      ↓
Autosave request
      ↓
Server validation
      ↓
Database
```

Offline:

``` text
IndexedDB
   ↓
sync queue
   ↓
server
```

The test should survive:

-   refresh,
-   accidental tab close,
-   temporary network failure.

Submissions must be idempotent.

------------------------------------------------------------------------

# 24. Attempt History

Store each answer event:

``` text
userId
testId
questionId
selectedAnswer
correct
marks
timeTaken
confidence
mistakeType
createdAt
```

Historical attempts should be append-only.

Do not rewrite old attempts when algorithms change.

------------------------------------------------------------------------

# 25. DPP Engine

The DPP is personalized practice.

Candidate sources:

``` text
weak concepts
prerequisites
revision due
previous mistakes
PYQs
mixed practice
```

Example 20-question DPP:

``` text
4 weak-concept questions
3 prerequisite questions
3 revision questions
3 previous-mistake questions
4 PYQs
3 mixed questions
```

Exact proportions should be configurable.

The LLM should not independently invent the daily DPP.

------------------------------------------------------------------------

# 26. Adaptive Difficulty

For weak concepts:

``` text
easy → medium → harder
```

For strong concepts:

``` text
medium → hard
```

Avoid spending most of the student's practice time on trivial questions.

------------------------------------------------------------------------

# 27. Unit Completion

Unit completion should depend on evidence:

``` text
syllabus coverage
concept mastery
practice accuracy
PYQ accuracy
repeated mistakes
readiness
```

Example:

``` text
Expected time: ~1 day

Mastery:        62%
Practice:       58%
PYQ:            45%
Mistakes:        6

→ Continue the unit.
```

Strong evidence:

``` text
Mastery:        90%
Practice:       87%
PYQ:            82%
Mistakes:        1

→ Provisionally complete / move forward.
```

Thresholds must be configurable and versioned.

------------------------------------------------------------------------

# 28. Personal Learning Velocity

Track actual unit duration.

Example:

``` text
DSA: 1.1 days/unit
OS:  1.8 days/unit
COA: 2.1 days/unit
```

Use it as a soft estimate.

Do not treat it as a deadline.

The system should learn:

> "This category of unit takes this learner longer."

not:

> "The learner failed because it took longer."

------------------------------------------------------------------------

# 29. Priority Engine

Candidate signals:

``` text
weakness
syllabus/exam importance
exam proximity
prerequisite importance
mistake frequency
revision urgency
recent performance
PYQ performance
unit state
```

Conceptual model:

``` text
priority =
    weakness
  + importance
  + exam proximity
  + prerequisite importance
  + mistake frequency
  + revision urgency
  + recent performance
```

The exact implementation is custom TypeScript and should be versioned.

------------------------------------------------------------------------

# 30. Recommendation Actions

Possible actions:

``` text
STUDY_CONCEPT
REVISE_CONCEPT
SOLVE_EASY
SOLVE_MEDIUM
SOLVE_HARD
REVIEW_MISTAKES
TAKE_MINI_TEST
TAKE_TOPIC_TEST
TAKE_MOCK
FLASHCARD_REVIEW
```

The engine generates candidate actions, scores them, and selects the
next useful action.

------------------------------------------------------------------------

# 31. Next Best Action

Example:

``` text
NEXT TARGET

OS → Memory Management → Page Replacement

Why:
- recent accuracy is low
- FIFO/LRU mistakes repeat
- PYQ performance is weak
- prerequisite mastery is incomplete

Action:
1. Review page replacement
2. Solve 5 medium questions
3. Review 2 previous mistakes
4. Take a 5-question mastery check
```

------------------------------------------------------------------------

# 32. Planner

Planner layers:

``` text
Master Plan
    ↓
Adaptive Plan
    ↓
Today's Target
```

### Master Plan

What eventually needs to be covered.

### Adaptive Plan

What currently deserves priority.

### Today's Target

What to do next.

The planner should not create an hourly schedule.

------------------------------------------------------------------------

# 33. Exam Countdown

Inputs:

``` text
examDate
remainingDays
remainingConcepts
revisionBacklog
PYQCoverage
mockReadiness
currentLearningVelocity
```

The system can report pace and remaining workload.

It should not predict score, rank, or exam outcome.

------------------------------------------------------------------------

# 34. Falling-Behind Analysis

If expected coverage exceeds actual coverage, investigate:

``` text
hard units
prerequisite gaps
low accuracy
repeated mistakes
retention problems
revision backlog
unexpected delays
```

Then adapt:

``` text
protect important work
reduce low-value repetition
merge easy work where reasonable
defer low-priority material
protect PYQs
protect revision
protect mock readiness
```

Do not simply demand more study hours.

------------------------------------------------------------------------

# 35. "Am I On Track?"

Show:

``` text
Syllabus coverage
Concept mastery
PYQ coverage
Revision coverage
Mock readiness
Remaining exam time
Current learning pace
```

Example:

``` text
Syllabus: 72%
Mastery:  59%
PYQs:     63%
Revision: 41%
Mocks:    2/8
```

This is an evidence dashboard.

------------------------------------------------------------------------

# 36. "Why Am I Not Progressing?"

Generate explanations from actual metrics.

Example:

``` text
Why progress slowed:

• 3 units required extra time because prerequisite mastery was low.
• OS PYQ accuracy is 51%.
• 6 repeated mistakes remain unresolved.
• Revision backlog increased by 4 concepts.
• Actual OS unit velocity is ~1.8 days/unit.
```

The LLM can phrase this, but the underlying numbers come from the
database.

------------------------------------------------------------------------

# 37. Chatbot Architecture

The chatbot is the conversational interface to the learning engine.

Example:

> "I finished OS Unit 2. Theory was okay, but page replacement was
> difficult. I got 9/15 questions right and I'm still confused between
> FIFO and LRU."

LLM extracts a structured report:

``` json
{
  "unit": "OS-2",
  "understanding": "partial",
  "readiness": "not_ready",
  "weakConcepts": ["FIFO", "LRU", "Page Replacement"],
  "attempted": 15,
  "correct": 9,
  "difficulty": "hard"
}
```

Then:

``` text
StudySessionReport
        ↓
Zod validation
        ↓
Learning Engine
        ↓
Update state
        ↓
Priority Engine
        ↓
DPP Generator
        ↓
Planner
```

------------------------------------------------------------------------

# 38. Study Session Report

Suggested structure:

``` text
sessionId
unitId
topics
concepts
understanding
difficulty
confidence
reportedMistakes
readiness
questionsAttempted
questionsCorrect
notes
```

The LLM interprets natural language into this structure.

The application determines the actual learning consequences.

------------------------------------------------------------------------

# 39. Self-Report vs Performance

Student:

> "I understand this perfectly."

Data:

``` text
Recent accuracy = 42%
PYQ accuracy = 31%
Repeated mistakes = 7
```

The system should not blindly accept self-report.

Combine:

``` text
self-report
+
actual performance
+
historical state
```

This produces a more reliable learning state.

------------------------------------------------------------------------

# 40. User Override

The system should always allow:

``` text
follow recommendation
override
skip
snooze
```

Example:

> "I know you recommend OS, but I want to finish DBMS first."

Store:

``` text
recommendation
userChoice
overrideReason
timestamp
```

The outcome can later be evaluated.

------------------------------------------------------------------------

# 41. AI Service

Generic interface:

``` text
AIService
├── generateText()
├── generateStructured()
├── stream()
└── embed()
```

Specialized modules:

``` text
QuestionClassifier
DifficultyEstimator
ExplanationGenerator
HintGenerator
MistakeAnalyzer
ConceptExtractor
ReportGenerator
Tutor
QuestionGenerator
```

------------------------------------------------------------------------

# 42. AI Model Routing

Do not couple business logic to a single provider.

``` text
Application
     ↓
AI Service
     ↓
Model Router
 ┌───┼────┐
 ▼   ▼    ▼
LLM1 LLM2 LLM3
```

Use smaller/cheaper models for:

-   classification,
-   tagging,
-   extraction.

Use stronger models for:

-   complex tutoring,
-   difficult explanations,
-   research synthesis.

------------------------------------------------------------------------

# 43. Structured AI Outputs

All machine-consumed output should use schemas.

Example:

``` json
{
  "concepts": [
    "Conflict Serializability",
    "Precedence Graph"
  ],
  "difficulty": 3,
  "mistakeType": "CONCEPT_GAP",
  "confidence": 0.91
}
```

Validate with Zod.

If invalid:

``` text
AI output
 ↓
Zod
 ↓
retry / repair / reject
```

Never write unvalidated AI output into authoritative tables.

------------------------------------------------------------------------

# 44. AI Explanation Pipeline

``` text
Wrong attempt
      ↓
Question
      ↓
Trusted solution
      ↓
Relevant concepts
      ↓
Student mistake history
      ↓
LLM
      ↓
Explanation
      ↓
Cache/store
```

Ground explanations in trusted sources when possible.

------------------------------------------------------------------------

# 45. Tutor Modes

Support:

``` text
Explain
Hint
Solve
Teach from basics
Give practice
Quiz me
Explain my mistake
Compare concepts
```

Learning-first mode:

``` text
Hint 1
 ↓
Hint 2
 ↓
Concept reminder
 ↓
Final solution
```

Future:

``` text
Socratic mode
Research mode
```

------------------------------------------------------------------------

# 46. RAG Architecture

``` text
Student question
      ↓
Query understanding
      ↓
Embedding
      ↓
pgvector
      +
PostgreSQL FTS
      ↓
Metadata filtering
      ↓
Ranking
      ↓
Relevant chunks
      ↓
LLM
      ↓
Answer + citations
```

RAG is the knowledge retrieval layer, not the learning engine.

------------------------------------------------------------------------

# 47. RAG Data Model

Store:

``` text
Resource
ResourceVersion
ResourceChunk
Embedding
Citation
Concept
```

Chunk metadata:

``` text
resourceId
page
section
sourceUrl
conceptIds
contentHash
license
retrievedAt
```

------------------------------------------------------------------------

# 48. Source Reliability

Classify resources:

``` text
OFFICIAL
VERIFIED
CURATED
COMMUNITY
AI_GENERATED
```

Prioritize trusted sources.

Community content can be useful without being automatically
authoritative.

------------------------------------------------------------------------

# 49. RAG Prompt Injection

Retrieved content is untrusted.

A document may contain:

``` text
Ignore previous instructions.
```

That must remain document data, not a system instruction.

Conceptually separate:

``` text
SYSTEM INSTRUCTIONS

USER MESSAGE

RETRIEVED DOCUMENTS
```

Never allow retrieved content to replace system instructions.

------------------------------------------------------------------------

# 50. RAG Confidence

If retrieval is weak:

``` text
I don't have enough verified material to answer this confidently.
```

is preferable to fabricated certainty.

------------------------------------------------------------------------

# 51. PDF Ingestion

``` text
PDF
 ↓
LiteParse / LlamaParse
 ↓
text + pages + tables + links
 ↓
normalize
 ↓
map to GATE metadata
 ↓
semantic chunks
 ↓
embeddings
 ↓
PostgreSQL + pgvector
```

Use cloud parsing only when needed for difficult/scanned documents.

------------------------------------------------------------------------

# 52. GitHub Ingestion

Use Octokit:

``` text
GitHub
 ↓
repository metadata
 ↓
file discovery
 ↓
commit/version
 ↓
fetch relevant files
 ↓
parse
 ↓
normalize
 ↓
chunk
 ↓
embed
 ↓
store
```

Keep:

``` text
repository
owner
branch
commitSHA
path
sourceURL
license
contentHash
lastSyncedAt
```

GitHub does not imply public-domain content.

------------------------------------------------------------------------

# 53. Resource Provenance

Every external artifact should answer:

``` text
Where did it come from?
Who authored it?
What is the URL?
What license applies?
When was it retrieved?
What version/commit was used?
What content hash was stored?
```

When rights are unclear, prefer storing metadata and a link rather than
redistributing copied content.

------------------------------------------------------------------------

# 54. Content Ingestion Pipeline

``` text
Source
 ↓
Fetcher
 ↓
Raw Artifact
 ↓
Hash
 ↓
Parser
 ↓
Normalizer
 ↓
Metadata Extractor
 ↓
Question Extractor
 ↓
Concept Classifier
 ↓
Deduplicator
 ↓
Validator
 ↓
Review
 ↓
Publish
```

Every stage should have observable status and error information.

------------------------------------------------------------------------

# 55. AI-Generated Questions

Never immediately publish generated questions.

``` text
Generate
 ↓
Schema validation
 ↓
Independent solve
 ↓
Answer verification
 ↓
Numerical verification if applicable
 ↓
Duplicate detection
 ↓
Review
 ↓
APPROVED
```

Statuses:

``` text
DRAFT
UNDER_REVIEW
APPROVED
REJECTED
```

------------------------------------------------------------------------

# 56. Content Quality

Validation rules:

``` text
question has answer
question has topic
question has source
MCQ has valid option count
NAT has valid answer
MSQ has valid answer set
marks are valid
no exact duplicate
classification confidence is acceptable
```

Maintain a review queue even though only one person uses the platform.

------------------------------------------------------------------------

# 57. PostgreSQL + pgvector

Use one primary database:

``` text
PostgreSQL
├── relational data
├── analytics
├── full-text search
└── pgvector
```

Do not initially add:

``` text
Pinecone
Qdrant
Elasticsearch
MongoDB
Redis
```

unless a concrete requirement appears.

------------------------------------------------------------------------

# 58. Object Storage

Large files belong in object storage.

Use:

``` text
Backblaze B2
```

or another S3-compatible provider.

Database stores:

``` text
objectKey
contentHash
mimeType
size
source
```

Keep raw artifacts separate from structured learning data.

------------------------------------------------------------------------

# 59. Search

Initial hybrid search:

``` text
PostgreSQL FTS
+
pgvector
```

Search dimensions:

``` text
question text
topic
concept
source
year
difficulty
question type
resource content
```

Later, if needed:

``` text
BM25/FTS
+
vector
+
reranker
```

------------------------------------------------------------------------

# 60. Client State

Use:

``` text
TanStack Query
    ↓
server state
```

Use:

``` text
Zustand
    ↓
UI/client state
```

Use:

``` text
Dexie
    ↓
offline/local persistence
```

Do not put the entire database into Zustand.

PostgreSQL remains authoritative.

------------------------------------------------------------------------

# 61. Background Jobs

Use Inngest for:

``` text
attempt-submitted
generate-explanation
ingest-resource
generate-embeddings
verify-question
recalculate-analytics
daily-maintenance
weekly-review
```

Slow operations should not block normal UI requests.

------------------------------------------------------------------------

# 62. Idempotency

Jobs may retry.

Use:

-   event IDs,
-   unique constraints,
-   upserts,
-   deterministic job keys,
-   content hashes.

A job should be safe to execute more than once.

------------------------------------------------------------------------

# 63. Daily Maintenance

Example:

``` text
daily-maintenance
├── update retention
├── rebuild review queue
├── roll missed plan items
├── prepare next DPP
├── update aggregates
└── prepare notifications
```

------------------------------------------------------------------------

# 64. Weekly Review

``` text
weekly-review
├── compute weekly statistics
├── compare previous week
├── identify improvements
├── identify regressions
├── identify unresolved weaknesses
├── update plan
└── generate natural-language summary
```

Numbers come from deterministic analytics. The LLM only phrases the
report.

------------------------------------------------------------------------

# 65. Analytics

Separate raw events from computed metrics:

``` text
Raw Attempts
     ↓
Analytics
     ↓
Concept Metrics
     ↓
Subject Metrics
     ↓
Learning State
     ↓
Recommendations
```

Important events:

``` text
QUESTION_VIEWED
ANSWER_SUBMITTED
TEST_STARTED
TEST_RESUMED
TEST_SUBMITTED
TOPIC_STUDIED
RESOURCE_OPENED
FLASHCARD_REVIEWED
MISTAKE_CREATED
PLAN_ITEM_COMPLETED
AI_QUESTION_ASKED
```

------------------------------------------------------------------------

# 66. Mock Tests

Full mocks should reproduce the applicable GATE exam structure for the
target year.

Support:

-   timer,
-   question palette,
-   navigation,
-   mark for review,
-   autosave,
-   scoring,
-   analysis.

Mock analytics:

``` text
score
accuracy
attempt rate
average time
subject performance
topic performance
question type performance
negative marks
time lost
```

Also track:

``` text
first-attempt accuracy
changed-answer accuracy
guess rate
reviewed-question accuracy
```

------------------------------------------------------------------------

# 67. Flashcards and FSRS

Flashcards are separate from the core mastery calculation.

``` text
Concept
  ↓
Flashcard
  ↓
FSRS
  ↓
Next review
```

Useful cards:

-   formulas,
-   definitions,
-   algorithms,
-   common traps,
-   concept comparisons,
-   previous mistakes.

------------------------------------------------------------------------

# 68. Recommendation Explainability

Store machine-readable reasons.

Example:

``` json
{
  "action": "REVISE_CONCEPT",
  "conceptId": "lru",
  "priority": 0.87,
  "reasons": [
    {
      "type": "LOW_RECENT_ACCURACY",
      "value": 0.42
    },
    {
      "type": "REPEATED_MISTAKES",
      "value": 5
    },
    {
      "type": "PYQ_WEAKNESS",
      "value": 0.48
    }
  ]
}
```

The UI and LLM can convert this into a human-readable explanation.

------------------------------------------------------------------------

# 69. "Why This?" UI

Every adaptive action should be explainable.

Example:

``` text
Why are you revising LRU?

• 5 recent mistakes.
• Recent accuracy: 42%.
• PYQ accuracy: 48%.
• Review is due.
• FIFO/LRU confusion has repeated.
```

This is one of the most important trust features.

------------------------------------------------------------------------

# 70. Database Entities

Core entities:

``` text
Exam
Subject
Unit
Topic
Concept
ConceptDependency

Resource
ResourceVersion
ResourceChunk
ResourceCitation

Question
QuestionVersion
QuestionConcept
QuestionSource

DPP
DPPQuestion

Test
TestQuestion
Attempt
Answer

Mistake
MistakeConcept

LearningState
ConceptStats
TopicStats
ReviewState

StudySession
StudySessionReport

StudyPlan
PlanItem
PlanSnapshot

ChatConversation
ChatMessage

AIInteraction
AIOutput

Job
Notification
```

------------------------------------------------------------------------

# 71. Important Relationships

``` text
User
 ├── Attempts
 ├── TopicStats
 ├── ConceptStats
 ├── Mistakes
 ├── Flashcards
 └── StudyPlans

Subject
 └── Units
      └── Topics
           └── Concepts

Question
 ├── Concepts
 ├── Sources
 └── Attempts

Test
 └── TestQuestions
      └── Questions
```

------------------------------------------------------------------------

# 72. Suggested ConceptStats Fields

``` text
id
userId
conceptId

completion
mastery
retention
confidence

attempts
correct
mistakes

averageTimeMs
lastSeen
nextReviewAt

pyqAttempts
pyqCorrect

createdAt
updatedAt

algorithmVersion
```

Unique constraint:

``` text
(userId, conceptId)
```

Useful indexes:

``` text
(userId, mastery)
(userId, nextReviewAt)
```

------------------------------------------------------------------------

# 73. Attempt Storage

Each answer should retain:

``` text
userId
testId
questionId
selectedAnswer
correct
marks
timeTaken
confidence
mistakeType
createdAt
```

Attempts are raw historical evidence.

Never silently overwrite them.

------------------------------------------------------------------------

# 74. Event-Sourced Thinking Without Overbuilding

You do not need a full event-sourcing framework.

Simply preserve important raw events and derive current state from them
where useful.

For example:

``` text
Attempt history
    ↓
analytics
    ↓
ConceptStats
    ↓
recommendations
```

This gives you historical reproducibility without distributed-event
complexity.

------------------------------------------------------------------------

# 75. Algorithm Versioning

Version:

``` text
masteryAlgorithm
retentionAlgorithm
recommendationAlgorithm
plannerAlgorithm
dppAlgorithm
```

Example:

``` text
masteryAlgorithmVersion = "v1"
recommendationVersion = "v2"
plannerVersion = "v1"
```

Historical decisions should remain explainable.

------------------------------------------------------------------------

# 76. Experiment Framework

Even with one user, experiments are useful.

``` text
Experiment
├── algorithmVersion
├── startDate
├── endDate
├── metric
└── notes
```

Example:

``` text
Planner V1
vs
Planner V2
```

Compare:

``` text
DPP completion
accuracy
mastery improvement
retention
time efficiency
```

Do not optimize only for application engagement.

------------------------------------------------------------------------

# 77. AI Evaluation

Maintain a benchmark:

``` text
100 verified questions
50 verified explanations
50 misconception cases
```

Measure:

``` text
classification accuracy
explanation correctness
citation correctness
hallucination rate
concept classification accuracy
difficulty classification accuracy
```

Every significant model/prompt change should be tested against it.

------------------------------------------------------------------------

# 78. Recommendation Evaluation

Core measurement:

``` text
Recommendation
      ↓
Intervention
      ↓
Outcome
```

Example:

``` text
Recommended:
Review Topic A

Before:
45%

After:
72%
```

Track:

``` text
mastery improvement
retention improvement
time efficiency
completion rate
recommendation acceptance
```

------------------------------------------------------------------------

# 79. UI Architecture

Suggested routes:

``` text
app/
├── dashboard/
├── syllabus/
├── practice/
├── tests/
├── mocks/
├── planner/
├── mistakes/
├── flashcards/
├── reports/
├── tutor/
└── api/
```

Components:

``` text
components/
├── ui/
├── dashboard/
├── syllabus/
├── test/
├── planner/
├── analytics/
└── tutor/
```

------------------------------------------------------------------------

# 80. Server Architecture

``` text
server/
├── db/
├── auth/
├── domains/
│   ├── syllabus/
│   ├── questions/
│   ├── tests/
│   ├── grading/
│   ├── attempts/
│   ├── mastery/
│   ├── revision/
│   ├── planner/
│   ├── analytics/
│   ├── recommendations/
│   ├── mistakes/
│   ├── flashcards/
│   ├── ai/
│   └── ingestion/
│
├── jobs/
└── services/
```

Keep domain services independent from HTTP.

------------------------------------------------------------------------

# 81. Thin API Layer

Example:

``` text
POST /api/tests/:id/submit
```

should perform:

``` text
validate request
      ↓
testService.submit()
      ↓
gradingService
      ↓
attemptService
      ↓
masteryService
      ↓
emit event
```

Business logic should not live inside route handlers.

------------------------------------------------------------------------

# 82. Dashboard UX

The dashboard should prioritize action:

``` text
TODAY

Preparation:
████████████░░ 72%

NEXT ACTION
OS → Page Replacement
Review + 5 questions

DPP
8 / 10

Reviews due
6

Weak concepts
4

Plan status
Needs attention
```

------------------------------------------------------------------------

# 83. Syllabus UX

Example:

``` text
DBMS

Completion: 78%
Mastery:    61%

Transactions     ██████████░
Normalization    ███████████
Indexing         ███████░░░
Recovery         ████░░░░░░
```

Clicking a topic reveals concepts.

------------------------------------------------------------------------

# 84. Concept Detail UX

``` text
Conflict Serializability

Mastery:        43%
Retention:      51%
Confidence:     68%

Accuracy:       52%
Recent:         33%

Attempts:       18
Average Time:   118 sec

Recommended:
Review precedence graphs
```

Actions:

``` text
Study
Practice
Mistakes
Flashcards
Test
```

------------------------------------------------------------------------

# 85. Accessibility

Support:

-   keyboard navigation,
-   screen readers,
-   labels,
-   focus states,
-   accessible dialogs,
-   high contrast,
-   reduced motion.

Color should not be the only information channel.

------------------------------------------------------------------------

# 86. PWA / Offline

Later:

``` text
Server
  ↓
Download test
  ↓
Dexie / IndexedDB
  ↓
Solve offline
  ↓
Sync queue
  ↓
Server
```

Offline mode should preserve raw attempts and synchronize them safely.

------------------------------------------------------------------------

# 87. Security

Use:

``` text
HTTPS
secure cookies
authentication
server-side authorization
input validation
rate limiting
server-side secrets
content sanitization
```

Never expose:

``` text
DATABASE_URL
LLM_API_KEY
B2_SECRET
INNGEST_SIGNING_KEY
```

to the browser.

------------------------------------------------------------------------

# 88. AI Security

AI endpoints are expensive.

Protect them with:

``` text
authentication
rate limits
input size limits
token limits
caching
model restrictions
```

Do not expose arbitrary provider/model parameters to the user.

------------------------------------------------------------------------

# 89. External Content Security

Sanitize Markdown/HTML from external sources.

Never blindly render untrusted content using raw HTML.

Treat external documents as data.

------------------------------------------------------------------------

# 90. Data Privacy

Collect only necessary information:

``` text
account
study activity
attempts
preferences
progress
```

Provide:

``` text
Export data
Delete account
Delete history
```

The learning database should not contain unnecessary sensitive
information.

------------------------------------------------------------------------

# 91. Backups

Because historical learning data is valuable:

``` text
PostgreSQL
    ↓
scheduled backup
    ↓
private B2 bucket
```

Keep multiple versions.

Also provide:

``` text
Export My Data
```

as JSON.

------------------------------------------------------------------------

# 92. Deployment

Recommended personal deployment:

``` text
Internet
   ↓
Vercel / Next.js
   ├── UI
   ├── API
   └── Auth
        │
        ▼
Neon PostgreSQL
+ pgvector
        │
        ├── learning data
        ├── questions
        ├── attempts
        └── RAG data

B2
 └── large files

Inngest
 └── background jobs

GitHub Actions
 ├── ingestion
 ├── evaluation
 └── backups
```

------------------------------------------------------------------------

# 93. Environments

Maintain:

``` text
development
staging
production
```

For a single user, staging can remain lightweight.

Never experiment with destructive schema changes directly against
production.

------------------------------------------------------------------------

# 94. CI/CD

Pull request:

``` text
lint
typecheck
unit tests
build
schema validation
```

Then:

``` text
deploy staging
```

Production:

``` text
approved deployment
```

------------------------------------------------------------------------

# 95. Testing Strategy

## Unit tests

Highest priority:

``` text
GATE grading
mastery
retention
priority
DPP selection
planner
revision
```

## Integration tests

``` text
test submission
database writes
learning-state updates
AI pipeline
background jobs
```

## E2E

``` text
login
start test
answer
refresh
submit
view result
complete DPP
submit study session
```

------------------------------------------------------------------------

# 96. Critical Test Cases

### MCQ

``` text
correct
incorrect
unanswered
negative marking
```

### MSQ

``` text
exact answer
incorrect answer
applicable marking behavior
```

### NAT

``` text
accepted value
outside tolerance
```

### Recovery

``` text
refresh
network failure
duplicate submission
resume
```

These tests protect the integrity of the learning model.

------------------------------------------------------------------------

# 97. Performance

Optimize database access before adding infrastructure.

The dashboard should ideally use a small number of optimized queries.

Cache:

``` text
syllabus
static metadata
question metadata
cached AI explanations
```

Be careful caching:

``` text
test answers
attempt state
mastery updates
```

because consistency matters.

------------------------------------------------------------------------

# 98. AI Cost Management

AI is likely to be the largest variable cost.

Use:

``` text
caching
batch generation
small models for classification
larger models only when needed
structured outputs
token limits
retrieval before generation
```

Do not call an expensive model for every page view.

------------------------------------------------------------------------

# 99. Embedding Strategy

Store:

``` text
model
dimension
contentHash
createdAt
embeddingVersion
```

If the embedding model changes:

``` text
old embeddings
new embeddings
```

must not be mixed blindly.

------------------------------------------------------------------------

# 100. Chunking

Prefer semantic structure:

``` text
heading
subheading
paragraph
example
solution
```

Preserve:

``` text
document
page
section
topic
concept
```

metadata.

------------------------------------------------------------------------

# 101. Resource Discovery

Eventually:

``` text
Scheduler
   ↓
web / GitHub / configured sources
   ↓
discover
   ↓
evaluate
   ↓
download
   ↓
parse
   ↓
extract
   ↓
map to concepts
   ↓
deduplicate
   ↓
verify
   ↓
store
```

The goal is to reduce manual resource hunting.

------------------------------------------------------------------------

# 102. Resource Ranking

A resource can be ranked using:

``` text
source reliability
recency
coverage
concept relevance
quality signals
duplicate content
license status
```

The ranking should be deterministic where possible.

The LLM can provide supporting classification signals.

------------------------------------------------------------------------

# 103. Notifications

Optional future channels:

``` text
Web Push
Telegram
Email
```

Core functionality must not depend on any notification provider.

Useful notifications:

``` text
6 reviews are due today.
Your DPP is ready.
Your weekly review is available.
```

Avoid notification spam.

------------------------------------------------------------------------

# 104. Telegram

Telegram can be a notification surface:

``` text
Today's GATE plan

1. OS — current target
2. DPP — 10 questions
3. Revision — 5 concepts

Open app:
...
```

Telegram is not the source of truth.

------------------------------------------------------------------------

# 105. Folder Structure

``` text
gate-ai/
│
├── app/
│   ├── (auth)/
│   ├── dashboard/
│   ├── syllabus/
│   ├── practice/
│   ├── tests/
│   ├── mocks/
│   ├── planner/
│   ├── mistakes/
│   ├── flashcards/
│   ├── reports/
│   ├── tutor/
│   └── api/
│
├── components/
│   ├── ui/
│   ├── dashboard/
│   ├── syllabus/
│   ├── test/
│   ├── planner/
│   ├── analytics/
│   └── tutor/
│
├── server/
│   ├── db/
│   ├── auth/
│   ├── domains/
│   │   ├── syllabus/
│   │   ├── questions/
│   │   ├── tests/
│   │   ├── grading/
│   │   ├── attempts/
│   │   ├── mastery/
│   │   ├── revision/
│   │   ├── planner/
│   │   ├── analytics/
│   │   ├── recommendations/
│   │   ├── mistakes/
│   │   ├── flashcards/
│   │   ├── ai/
│   │   └── ingestion/
│   │
│   ├── jobs/
│   └── services/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
│
├── scripts/
│   ├── import-syllabus.ts
│   ├── import-questions.ts
│   └── generate-embeddings.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   └── GATE_AI_ARCHITECTURE.md
│
├── .github/
│   └── workflows/
│
└── package.json
```

------------------------------------------------------------------------

# 106. Environment Variables

Example:

``` env
DATABASE_URL=
DIRECT_DATABASE_URL=

AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

LLM_API_KEY=
LLM_MODEL=

EMBEDDING_MODEL=

B2_ENDPOINT=
B2_REGION=
B2_BUCKET=
B2_KEY_ID=
B2_APP_KEY=

SENTRY_DSN=

NEXT_PUBLIC_APP_URL=
```

Never commit secrets.

Only expose variables with `NEXT_PUBLIC_*` when they are safe for
browsers.

------------------------------------------------------------------------

# 107. What the Student Experiences

The backend is complicated; the UX should be simple.

## Start of day

``` text
Today's target

OS → Page Replacement

Reason:
Repeated FIFO/LRU mistakes.

Action:
Review → DPP → mastery check
```

## During study

Student asks:

> "Explain LRU, but don't give me the final answer immediately."

Tutor provides hints.

## During practice

System records:

``` text
answer
time
confidence
correctness
```

## After practice

System detects:

``` text
FIFO/LRU confusion
```

## After study

Student says:

> "I still don't feel ready."

System records the self-report and combines it with objective evidence.

## Next DPP

Automatically includes:

``` text
prerequisite questions
FIFO/LRU questions
previous mistakes
PYQs
```

------------------------------------------------------------------------

# 108. Full Example

Student studies:

``` text
OS → Memory Management → Page Replacement
```

They solve 15 questions:

``` text
9 correct
6 wrong
```

The system calculates:

``` text
accuracy = 60%
```

Wrong questions map to:

``` text
FIFO
LRU
Belady's anomaly
```

LLM mistake analysis suggests:

``` text
4 conceptual mistakes
1 misread
1 careless error
```

Learning state updates:

``` text
FIFO mastery ↓
LRU mastery ↓
Belady mastery ↓
```

Recommendation engine sees:

``` text
Page Replacement = high priority
```

DPP generator creates:

``` text
3 prerequisite questions
4 FIFO/LRU questions
2 previous mistakes
3 PYQs
3 mixed questions
```

The chatbot explains:

> Your unit is not being marked complete yet because recent accuracy and
> PYQ performance are still below the current mastery threshold. The
> next practice set will focus on FIFO/LRU before moving forward.

No custom ML model was required.

------------------------------------------------------------------------

# 109. What Happens When the Student Falls Behind

Suppose expected progress is:

``` text
10 units
```

but actual progress is:

``` text
7 units
```

The system investigates.

Possible explanation:

``` text
OS required 2 extra days
TOC had prerequisite gaps
PYQ accuracy fell
revision backlog increased
```

Then it adapts:

``` text
Continue difficult unit
Reduce low-value repetition
Protect PYQs
Protect revision
Move low-priority work later
```

It should not simply say:

> "Study four extra hours tomorrow."

------------------------------------------------------------------------

# 110. Why the LLM Is Not the Planner

The LLM may propose:

> "Maybe study DBMS."

The recommendation engine calculates actual priority.

Example:

``` text
OS  = 0.91
DBMS = 0.82
CN  = 0.64
```

The engine chooses OS.

The LLM then explains:

> OS is currently the highest priority because recent accuracy is low,
> prerequisite mastery is weak, and related PYQs are underperforming.

This is the correct separation of responsibilities.

------------------------------------------------------------------------

# 111. Why No ML Initially

You have one learner and initially limited data.

Custom ML would introduce:

-   training complexity,
-   data requirements,
-   evaluation complexity,
-   model drift,
-   infrastructure,
-   debugging complexity.

Start with:

``` text
rules
+
statistics
+
FSRS
+
concept graph
+
LLM
```

After enough history exists, evaluate whether ML actually improves
outcomes.

------------------------------------------------------------------------

# 112. Possible Future ML

Only after sufficient data:

### Bayesian Knowledge Tracing

Estimate probability of concept mastery.

### Item Response Theory

Model:

``` text
student ability
question difficulty
question discrimination
```

### Knowledge Tracing

Model concept learning over time.

### Learned Recommendation

Predict which intervention has the highest probability of improvement.

These are research directions, not V1 requirements.

------------------------------------------------------------------------

# 113. MVP Roadmap

## Phase 1 --- Foundation

``` text
Next.js
TypeScript
Prisma
PostgreSQL
Syllabus
Dashboard
```

## Phase 2 --- Question Engine

``` text
Question model
Question bank
Topic quiz
Answer submission
GATE scoring
Attempt history
```

## Phase 3 --- Learning Engine

``` text
ConceptStats
Mastery
Retention
Mistakes
Reports
```

This is the first major value milestone.

## Phase 4 --- DPP

``` text
adaptive selection
weak-topic weighting
revision
previous mistakes
PYQs
```

## Phase 5 --- Planner

``` text
exam countdown
master plan
adaptive plan
today target
catch-up
pace meter
```

## Phase 6 --- Mock

``` text
full mock
timer
autosave
palette
scoring
analytics
```

## Phase 7 --- AI

``` text
explanations
hints
mistake analysis
question tagging
chatbot
study-session extraction
```

## Phase 8 --- RAG

``` text
resource ingestion
chunking
embeddings
pgvector
retrieval
citations
AI tutor
```

## Phase 9 --- Resource Discovery

``` text
web/GitHub discovery
question extraction
classification
deduplication
verification
```

## Phase 10 --- Research

``` text
algorithm experiments
recommendation evaluation
difficulty recalibration
advanced analytics
optional ML
```

------------------------------------------------------------------------

# 114. Do Not Start With AI

The first working loop should be:

``` text
Syllabus
  ↓
Questions
  ↓
Test
  ↓
GATE grading
  ↓
Attempts
  ↓
Learning state
  ↓
Weakness
  ↓
DPP
  ↓
Next target
```

Then add the chatbot.

Then add RAG.

Then add automatic resource ingestion.

This gives the project value before AI complexity grows.

------------------------------------------------------------------------

# 115. First Major Milestone

The first real milestone is:

``` text
Student
 ↓
selects topic
 ↓
takes test
 ↓
submits
 ↓
system scores correctly
 ↓
attempt saved
 ↓
mastery updated
 ↓
weak concept detected
 ↓
next action generated
```

If this works reliably, the core architecture is correct.

------------------------------------------------------------------------

# 116. V1 Definition of Done

``` text
[ ] GATE exam configuration
[ ] Syllabus
[ ] Subjects
[ ] Units
[ ] Topics
[ ] Concepts
[ ] Concept dependencies

[ ] Question bank
[ ] MCQ
[ ] MSQ
[ ] NAT
[ ] Test engine
[ ] Autosave
[ ] GATE scoring
[ ] Attempt history

[ ] Concept mastery
[ ] Retention
[ ] Mistake notebook
[ ] Revision queue
[ ] DPP

[ ] Adaptive planner
[ ] Exam countdown
[ ] Pace analysis
[ ] "Am I on track?"
[ ] "Why am I not progressing?"

[ ] Mock tests
[ ] Mock analytics

[ ] AI explanation
[ ] AI hints
[ ] AI mistake analysis
[ ] Chatbot
[ ] Study-session extraction

[ ] Basic RAG
[ ] Source attribution

[ ] Background jobs
[ ] Backups
[ ] Tests
[ ] Monitoring
```

Not every feature must be highly automated in the first release.

------------------------------------------------------------------------

# 117. Core Architectural Boundaries

The system has five major layers.

``` text
┌─────────────────────────────────────────┐
│ UI / UX                                 │
│ Next.js / React                         │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│ Application Layer                       │
│ APIs / actions / orchestration          │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│ Domain Layer                            │
│ grading / mastery / planner / DPP       │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│ Data Layer                              │
│ Prisma / PostgreSQL / pgvector          │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│ External Services                       │
│ LLM / B2 / GitHub / Inngest / parsing   │
└─────────────────────────────────────────┘
```

The domain layer should remain as provider-independent as practical.

------------------------------------------------------------------------

# 118. Final Mental Model

``` text
              ┌─────────────┐
              │     LLM     │
              │ Understand  │
              │ Extract     │
              │ Explain     │
              │ Converse    │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │  Learning   │
              │   Engine    │
              │             │
              │ Measure     │
              │ Calculate   │
              │ Prioritize  │
              │ Adapt       │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │ PostgreSQL  │
              │ Source of   │
              │ Truth       │
              └─────────────┘
```

The complete product is therefore:

``` text
GATE Knowledge
      +
Student History
      +
Question Performance
      +
Mistake History
      +
Study Conversations
      ↓
Learning State
      ↓
Priority
      ↓
DPP / Revision / Next Target
      ↓
Student
      ↓
More evidence
      ↺
```

------------------------------------------------------------------------

# 119. Final Architectural Principle

> **The system exists to improve the student's next learning decision,
> not to maximize the amount of AI functionality.**

If a feature does not meaningfully improve:

``` text
Understanding
Practice
Retention
Mistake Recovery
Planning
Decision Quality
```

it should not be prioritized.

The final product is not:

> "ChatGPT for GATE."

It is:

> **A personal adaptive GATE preparation engine that uses an LLM as its
> conversational and reasoning interface, while deterministic learning
> systems maintain the actual learning state and decide what the student
> should do next.**

That separation keeps the project understandable, testable, inexpensive,
and capable of evolving as more personal learning data is collected.


# Personal Syllabus, Coverage, and Plan Model

## Purpose

The system must support two complementary sources of preparation structure:

1. A **built-in canonical GATE syllabus** maintained by the application.
2. The student's **personal syllabus coverage, preparation plan, and preferences**, which can be entered naturally through the chatbot or through the UI.

These must not be treated as the same thing.

The built-in syllabus defines **what exists to be studied**. The student's plan defines **how they intend to approach it**. The learning engine records **what is actually happening**.

The resulting model is:

```text
Canonical GATE Syllabus
        +
Personal Plan & Preferences
        +
Actual Learning Evidence
        ↓
Adaptive Learning State
        ↓
Next Best Learning Action
```

## Canonical Built-In Syllabus

The application should contain a structured representation of the relevant GATE syllabus.

The hierarchy should support:

```text
Exam
 └── Subject
      └── Unit
           └── Topic
                └── Concept
```

For example:

```text
Operating Systems
 ├── Processes
 ├── Threads
 ├── CPU Scheduling
 ├── Synchronization
 ├── Deadlocks
 ├── Memory Management
 └── File Systems
```

The exact syllabus content should be stored as structured domain data rather than as a large prompt.

The canonical syllabus is the reference structure used by:

- coverage tracking
- concept tracking
- question classification
- PYQ mapping
- prerequisite relationships
- mastery calculations
- DPP generation
- revision planning
- recommendation logic
- progress dashboards
- exam-readiness analysis

The chatbot should resolve natural-language references such as "OS Unit 2" or "subnetting" to canonical syllabus entities.

## Personal Plan and Preferences

The student must be able to tell the chatbot how they want to prepare.

For example:

> I want to aim for roughly one unit per day, but difficult units can take two or three days. I don't want fixed study-time scheduling. Tell me what I should work on next based on my actual progress.

The system should extract this into structured preferences such as:

```text
Planning strategy:
  target unit velocity: approximately 1 unit/day
  allowed extension: yes
  hard units may take multiple days
  fixed time-slot scheduling: disabled
  recommendation style: next-task focused
```

The plan is a **target and preference**, not a rigid schedule.

The system must never interpret:

```text
1 unit/day
```

as:

```text
every unit must be completed within exactly one calendar day
```

Instead, it represents the student's intended learning velocity.

## Personal Coverage Input

The chatbot should allow the student to report current syllabus coverage in natural language.

Example:

> I've completed DBMS Units 1 and 2. Unit 3 is half done. I haven't started Unit 4.

The chatbot should translate this into structured state:

```text
DBMS
 ├── Unit 1 → completed
 ├── Unit 2 → completed
 ├── Unit 3 → learning / partial
 ├── Unit 4 → not started
 └── Unit 5 → not started
```

The exact internal status should be determined by the learning-state model rather than blindly trusting the word "completed."

For example, a user may report that a unit is complete while question accuracy and PYQ performance indicate that it still requires practice.

Therefore:

```text
User-reported coverage
        ↓
Initial state update
        ↓
Performance evidence
        ↓
Validated learning state
```

## Natural-Language Study Reports

The chatbot should accept post-study reports without requiring the student to manually fill every field.

Example:

> I've finished Computer Networks Unit 1. I understood most of the theory, but subnetting is still weak. I solved 20 questions and got 14 correct. I think I need another session before moving ahead.

The chatbot should extract structured facts such as:

```json
{
  "subject": "Computer Networks",
  "unit": 1,
  "status": "practicing",
  "self_reported_confidence": "medium",
  "weak_concepts": ["subnetting"],
  "questions_attempted": 20,
  "correct": 14,
  "continue_unit": true
}
```

The LLM performs the **language understanding and extraction**.

The deterministic learning engine performs the **actual state update and planning decision**.

The LLM must not directly become the source of truth for mastery.

## Plan vs Actual Progress

The system must maintain a clear distinction between:

### Planned

What the student intended to do.

Example:

```text
OS Unit 2
Target: approximately 1 day
```

### Actual

What the student actually achieved.

Example:

```text
OS Unit 2
Mastery: 61%
Question accuracy: 57%
PYQ accuracy: 48%
Repeated mistakes: 6
Prerequisite gap: detected
```

### Decision

What the adaptive engine recommends next.

Example:

```text
Continue OS Unit 2

Focus:
- page replacement
- memory prerequisites
- targeted PYQs

Reason:
Current evidence does not yet support moving the unit to
provisionally complete.
```

This separation is critical.

The application must never mark a unit complete merely because the planned number of days has elapsed.

## Coverage States

A personal coverage state should be tracked separately from mastery where useful.

Suggested states:

```text
NOT_STARTED
LEARNING
PRACTICING
PROVISIONALLY_COMPLETE
MASTERED
REVISION_DUE
```

Coverage can additionally include quantitative information such as:

```text
coverage_percentage
concepts_covered
concepts_remaining
questions_attempted
pyqs_attempted
revision_count
```

A unit can therefore be:

```text
Coverage: 100%
Mastery: 62%
PYQ accuracy: 48%
Status: PRACTICING
```

This is preferable to a single "completed/not completed" field.

## User Plan Is an Input, Not the Planner

The student's personal plan should influence the adaptive planner, but it must not override evidence.

The priority order should generally be:

```text
Student goals/preferences
        ↓
Canonical syllabus constraints
        ↓
Actual learning evidence
        ↓
Adaptive recommendation
```

If the student's plan says:

```text
finish Unit 2 today
```

but evidence shows:

```text
major prerequisite gap
low accuracy
repeated mistakes
poor PYQ performance
```

the system should explain why continuing the unit is appropriate rather than pretending that the target was achieved.

## Personal Learning Velocity

The system should learn the student's actual unit velocity over time.

For example:

```text
Easy units:   ~0.8–1.0 day
Medium units: ~1.2–1.7 days
Hard units:   ~2–3 days
```

These are estimates, not deadlines.

The system should update its estimates using observed evidence:

```text
planned duration
actual duration
unit difficulty
prerequisite gaps
practice requirements
mastery achieved
```

This allows the system to become increasingly personalized without requiring a machine-learning model in V1.

## Chatbot-to-Learning-State Pipeline

The complete flow should be:

```text
Student message
      ↓
LLM interpretation
      ↓
Structured extraction
      ↓
Validation against canonical syllabus
      ↓
Learning-state update
      ↓
Mastery / mistake / retention calculations
      ↓
Adaptive planner
      ↓
DPP / revision / recommendation generation
      ↓
Chatbot explanation
```

For example:

```text
Student:
"I finished OS Unit 2 but page replacement is confusing.
I got 4 questions wrong and don't think I'm ready to move on."

        ↓

Extract:
- Subject: Operating Systems
- Unit: 2
- Weak concept: Page Replacement
- Mistakes: 4
- Readiness: not ready
- Continue unit: yes

        ↓

Learning engine:
- update concept weakness
- update mistake frequency
- update confidence
- evaluate unit completion
- identify prerequisite requirements

        ↓

Planner:
- keep Unit 2 active
- create targeted practice
- schedule revision according to retention state
- delay progression if completion criteria are not satisfied

        ↓

DPP:
- prerequisite questions
- page replacement questions
- previously wrong questions
- relevant PYQs
```

## User Override

The student must remain able to override the system.

For example:

> I know this topic is weak, but I want to move on today and return to it later.

The system should record this as an explicit user decision rather than silently fighting the user.

A useful model is:

```text
System recommendation
        +
User decision
        ↓
Recorded learning decision
```

The override should not erase the underlying evidence.

For example:

```text
System:
"Unit 2 still has low PYQ accuracy."

User:
"Move on anyway."

Stored state:
- Unit 2: unresolved weakness
- User override: move on
- Future revision obligation: retained
```

This preserves both autonomy and learning information.

## Syllabus Input Modes

The application should support three ways to establish syllabus state:

### A. Built-In Syllabus

The application already knows the canonical syllabus.

```text
Built-in syllabus
        ↓
Ready to use
```

### B. Initial User Declaration

The student can tell the chatbot what they have already covered.

```text
"I have completed OS Units 1 and 2,
and DBMS Unit 1."
```

The system maps this to canonical entities.

### C. Ongoing Conversational Updates

After every study session, the student can simply report what happened.

```text
"Today I completed OS Unit 3,
but synchronization still feels weak."
```

The system updates the relevant state.

The student should not need to repeatedly maintain spreadsheets manually.

## Why This Matters for the Project

The platform is not simply a syllabus checklist.

A checklist answers:

```text
"What have I read?"
```

The adaptive engine must answer:

```text
"What do I actually know?"
"What can I solve?"
"What do I repeatedly get wrong?"
"What should I revise?"
"What prerequisite is blocking me?"
"What should I work on next?"
```

Therefore the project needs three separate concepts:

```text
SYLLABUS
What exists.

PLAN
What I intend to do.

LEARNING STATE
What the evidence says is happening.
```

And one decision layer:

```text
ADAPTIVE PLANNER
What I should do next.
```

This distinction should be reflected in both the database schema and application architecture.

## Suggested Database Separation

At minimum, keep these concepts logically separate:

```text
Syllabus
  - canonical exam structure

StudentPlan
  - personal planning preferences
  - intended targets
  - optional plan notes

StudentCoverage
  - user-reported/current coverage

LearningState / ConceptStats
  - evidence-based mastery
  - accuracy
  - retention
  - confidence
  - mistakes
  - attempts

PlannerDecision
  - recommended next actions
  - reasons
  - priority
  - algorithm version

UserOverride
  - explicit decisions that differ from recommendations
```

They may live in fewer physical tables if implementation simplicity requires it, but the domain concepts should remain distinct.

## Updated Mental Model

The complete personal learning engine can be understood as:

```text
             CANONICAL GATE SYLLABUS
                       │
                       │
                       ▼
              PERSONAL STUDY PLAN
                       │
                       │
                       ▼
              ACTUAL STUDY ACTIVITY
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Attempts      Mistakes    Self-report
          │            │            │
          └────────────┼────────────┘
                       ▼
               LEARNING STATE
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Mastery     Retention    Coverage
          │            │            │
          └────────────┼────────────┘
                       ▼
               ADAPTIVE PLANNER
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
        DPP         Revision     Next Unit
                       │
                       ▼
                   CHATBOT
                       │
                       ▼
                   STUDENT
```

The chatbot is therefore the natural interface for updating the system, but it is not the system's source of truth.

## Final Principle for Personal Planning

The student's plan should be **expressed by the student, understood by the chatbot, stored structurally, and continuously adapted using evidence**.

The system should never punish the student merely because a one-day target became a three-day unit.

Instead, it should learn:

```text
"This unit was harder than expected."
```

and use that information to improve future planning.

The objective is not to make the student obey the original plan.

The objective is to make the plan increasingly accurate and useful for the actual student.



# FINAL V1 ARCHITECTURE UPDATE

This is the current implementation scope for the **single-user personal GATE preparation system**.

The priority is the reliable GATE learning loop, not maximum AI functionality.

```text
Canonical Syllabus
      ↓
Trusted Question Bank
      ↓
Practice / DPP / Mock
      ↓
Deterministic GATE Grading
      ↓
Attempts + Mistakes
      ↓
Learning State
      ↓
Priority / Planner
      ↓
Next Learning Action
```

AI is an interface around this engine, not its source of truth.

## Current Syllabus Is the Source of Truth

The **new syllabus created/supplied by the student** is the authoritative syllabus for this project.

Do not replace it with a generic GATE syllabus from model knowledge.

The syllabus must be imported as structured canonical data while preserving its actual subject names, unit names, topic names, concept names, ordering, hierarchy, terminology, and General Aptitude coverage.

The current implementation target includes the **55-unit structure plus General Aptitude** described by the student's new syllabus.

```text
Exam
 └── Subject
      └── Unit
           └── Topic
                └── Concept
```

The syllabus must be versioned:

```text
SyllabusVersion
Subject
Unit
Topic
Concept
```

Historical attempts and learning records should retain their relationship to the syllabus version active when they were created.

## V1 Scope

### Phase A — Foundation and Learning Engine

Build first:

- Email allowlist authentication
- Current canonical 55-unit syllabus + General Aptitude
- Unit status and coverage
- Today screen
- Trusted question bank
- Reliable answer keys
- GATE deterministic grading
- Attempt history
- Topic quizzes
- SQL/rule-based DPP generation
- One-tap mistake tags
- Unit-level mastery
- Weak-unit report
- Quick logging for work completed outside the app
- Daily encrypted backups
- Hard AI budget/quota cap

### Phase B — Planning and Assessment

Build after the core learning engine:

- Mock simulator
- Reliable autosave
- Server-authoritative mock deadline/timer
- Date-based preparation phases
- Marks-weighted priority
- Adaptive planner
- Finish-date projection
- Unit target duration
- Unit maximum extension
- Good-enough progression rule
- FSRS for flashcards
- Fixed revision ladder for units

### Phase C — AI Layer

Build only after A and B are stable:

- Cached AI explanations
- AI hints
- Chatbot study-report interface
- Chatbot filling the existing study-report form
- AI mistake-tagging assistance

The chatbot must use the same structured study-report workflow as the normal UI.

### Explicitly Deferred

Do not make these V1 dependencies:

- RAG
- PDF resource ingestion
- Automatic web/resource discovery
- Resource ranking pipeline
- AI-generated question generation
- Model router
- PostHog
- Dexie/offline synchronization
- Custom ML
- Experiment framework
- Delete-account UX
- Multi-user infrastructure

## Question Bank

A trusted question bank is a V1 requirement.

The first implementation target is approximately **1,000–1,500 trusted questions**, with the architecture able to grow toward the available PYQ corpus.

The broader planning assumption is approximately:

- ~3,500 available PYQs
- ~2,500 attempts across the roughly 20-week preparation period

These are planning estimates, not hard limits.

Each question should support:

```text
source
year/exam where applicable
subject
unit
topic
concept
question_type
difficulty
answer_key
explanation/source reference
```

Question correctness must be trusted before a question is used as learning evidence.

AI-generated questions are deferred.

## Learning State

Keep these concepts separate:

```text
SYLLABUS
What exists.

PLAN
What the student intends to do.

COVERAGE
What the student reports having covered.

LEARNING STATE
What the evidence shows the student actually knows/can do.

PLANNER
What should happen next.
```

A user saying "I finished Unit 2" should update reported coverage, but it must not automatically prove mastery.

Actual learning state should use:

- concept coverage
- question accuracy
- PYQ accuracy
- repeated mistakes
- prerequisite status
- recent performance
- retention/revision evidence

## Unit Completion

Do not use rigid universal thresholds such as 90/87/82 as if they were scientifically established.

Completion should combine:

```text
important concept coverage
+ concept mastery
+ practice accuracy
+ PYQ accuracy
+ repeated mistakes
+ prerequisite status
+ recent performance
+ current preparation phase
```

The formula must be configurable and versioned.

### Maximum Unit Duration

Every unit should have:

```text
target_duration
maximum_extension
good_enough_exit
```

The unit must not consume unlimited calendar time.

```text
Strong enough
→ PROVISIONALLY_COMPLETE

Improving but unfinished
→ CONTINUE within allowed extension

Maximum extension reached
→ GOOD_ENOUGH + unresolved weaknesses go to revision
```

This prevents one difficult unit from blocking the entire syllabus.

## Personal Plan and Coverage

The student can specify a preferred learning velocity such as:

> roughly one unit per day, but difficult units can take two or three days.

This is a soft target, not a rigid deadline.

The planner should learn actual velocity from planned duration, actual duration, unit difficulty, prerequisite gaps, practice requirements, and mastery achieved.

The planner should tell the student **what to work on**, not prescribe fixed study-time slots.

Natural-language coverage such as:

> I completed DBMS Units 1 and 2. Unit 3 is half done. Unit 4 is not started.

must resolve to canonical syllabus IDs rather than being stored as free text alone.

## Study Report and Chatbot

The structured study-report form is the canonical V1 interface.

It should support:

```text
subject
unit
status
topics covered
weak topics
questions attempted
questions correct
PYQs attempted
PYQs correct
self-confidence
continue unit?
notes
```

Later the chatbot fills the same form:

```text
Student message
      ↓
LLM extraction
      ↓
Study Report Draft
      ↓
User confirmation
      ↓
Learning-State Engine
      ↓
Planner
```

The chatbot must not directly mutate authoritative learning data.

## One-Tap Mistake Tags

Mistake classification is primarily user-controlled in V1.

Use:

```text
CONCEPTUAL_GAP
CALCULATION_ERROR
MISREAD
FORMULA_RECALL
CONFUSED_CONCEPTS
CARELESS_ERROR
GUESS
TIME_PRESSURE
```

AI mistake-tagging assistance is Phase C.

## Marks-Weighted Priority

The planner must include exam/marks importance.

Conceptually:

```text
priority =
    weakness
  + marks/exam importance
  + remaining syllabus
  + prerequisite importance
  + mistake frequency
  + revision urgency
  + recent performance
  + preparation phase
```

Exact coefficients must be configurable and versioned.

## Date-Based Preparation Phases

The planner uses the exam date and preparation phases:

```text
Phase 1
Coverage + foundation

Phase 2
Coverage completion + intensive practice

Phase 3
Revision + PYQs + weak-area repair

Phase 4
Mocks + final revision
```

The exact boundaries come from the actual exam date and the student's plan.

The planner recommends **what to do during the current phase**, not hourly schedules.

## Recommendation Evaluation

Do not validate recommendations using the system's own mastery number.

Instead:

```text
Recommendation
      ↓
Fresh unseen questions
+
PYQ performance
+
Mock performance
      ↓
Observed outcome
```

This prevents circular evaluation and provides independent evidence for improving the planner.

## Storage and Free-Tier Discipline

Use:

```text
Supabase PostgreSQL
+
Prisma
+
pgvector later, only when needed
```

Keep structured learning data in PostgreSQL.

Use Supabase Storage for source files initially.

Apply retention policies to:

- raw AI responses
- chat logs
- duplicate embeddings
- temporary ingestion artifacts
- unnecessary event payloads

The expected personal scale is small; size around actual usage rather than hypothetical SaaS scale.

## AI Budget Guard

V1 requires a hard AI budget/quota guard.

Track:

```text
provider
model
purpose
request count
tokens when available
estimated cost
cache hit/miss
date
```

When the limit is reached, cached results may still be used, but the core application must continue working with AI disabled.

## Backups

Daily encrypted PostgreSQL dumps are mandatory.

Show:

```text
Last successful backup
Backup age
```

Warn when the backup is older than the configured threshold, such as two days.

Perform a real restore test.

## Supabase / Prisma

Primary V1 database:

```text
Supabase PostgreSQL
+
Prisma
+
standard PostgreSQL features
```

Runtime uses the Supabase transaction pooler.

Migrations use the session/direct migration connection according to the project's network environment.

Conceptually:

```env
DATABASE_URL="...transaction pooler..."
DIRECT_URL="...migration/session connection..."
```

Keep the database layer portable so migration to Neon or another PostgreSQL provider remains practical.

## Development and Staging

Use local Docker PostgreSQL for development.

A second Supabase project may be used for staging.

Do not make Neon branches part of the V1 architecture.

## pgvector and RAG

pgvector is not required for the initial learning engine.

V1 can use:

```text
PostgreSQL relational queries
+
PostgreSQL full-text search
```

RAG, PDF ingestion, automatic resource discovery, resource ranking, and embeddings are deferred.

## Autosave and Phone Reliability

The application is not offline-first in V1.

Dexie/offline synchronization is deferred.

Autosave must still handle flaky phone networks using monotonically increasing answer sequence numbers:

```text
seq 41
seq 42
```

An older request must never overwrite a newer answer.

Use a small retry buffer for transient failures.

## Mock Timer

The mock timer must use a server-authoritative `deadlineAt`.

```text
remaining = deadlineAt - currentTime
```

Do not rely on a JavaScript interval surviving phone lock, browser backgrounding, or app suspension.

## Device Strategy

Use the phone for:

- DPP
- revision
- study reports
- quick practice
- progress review

Use the laptop/desktop for:

- full mocks
- longer question sessions
- detailed analysis

## Login Allowlist

Because this is a personal system, authentication should use an email allowlist.

Only explicitly allowed email identities should be able to enter the application.

## Today Screen

The Today screen should answer:

```text
What should I work on?
Why?
What is weak?
What is due for revision?
What should I practice?
```

It is not a time-slot scheduler.

## Final V1 User Loop

```text
Open app
   ↓
Today
   ↓
Recommended action
   ↓
Study / solve
   ↓
GATE grading
   ↓
One-tap mistake tagging
   ↓
Learning-state update
   ↓
DPP / revision / next action
```

Outside-app study:

```text
Quick Study Report
   ↓
Confirm
   ↓
Learning-state update
```

Later:

```text
Chatbot
   ↓
Study Report Draft
   ↓
Confirm
   ↓
Same learning-state engine
```

## Final Principle

**Build the GATE learning engine first. Add AI around a system that already works.**

The V1 success criterion is whether the system can reliably answer:

> Given the current syllabus, actual coverage, question performance, mistakes, preparation phase, exam date, and remaining time, what should I work on next?

Then validate that recommendation with fresh questions and later mock performance.

The product is not "ChatGPT for GATE."

It is a **personal adaptive GATE preparation engine with an AI interface**.
