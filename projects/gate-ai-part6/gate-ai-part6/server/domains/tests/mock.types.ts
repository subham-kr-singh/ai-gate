/**
 * Part 6 — shared types. Everything here is JSON-serialisable and free of
 * server-only imports, so client components may `import type` from it.
 */

export type QuestionType = 'MCQ' | 'MSQ' | 'NAT';
export type SectionKey = 'GA' | 'CORE';
export type MockStatus = 'READY' | 'IN_PROGRESS' | 'SUBMITTED';
export type SubmitReason = 'USER' | 'TIMER' | 'EXPIRED_SERVER';

/** MCQ: option id · MSQ: option ids · NAT: typed value · null: unanswered. */
export type RawAnswer = string | string[] | null;

export type MockEventKind =
  | 'SELECT'
  | 'CLEAR'
  | 'MARK'
  | 'UNMARK'
  | 'GUESS'
  | 'UNGUESS'
  | 'VISIT'
  | 'LEAVE'
  | 'TIME';

/** One autosave event. `seq` is a per-mock monotonic counter owned by the client. */
export interface MockEventInput {
  seq: number;
  questionId: string;
  kind: MockEventKind;
  selected?: RawAnswer;
  spentMs?: number;
  /** Client's estimate of SERVER time (Date.now() + clock offset) when it happened. */
  at: number;
}

// ── Questions ────────────────────────────────────────────────────────────────

export interface QuestionOption {
  id: string;
  text: string;
}

/** Metadata safe to keep server-side for grading/analytics. */
export interface PaperQuestion {
  id: string;
  type: QuestionType;
  marks: number;
  section: SectionKey;
  statement: string;
  options: QuestionOption[] | null;
  subjectId: string;
  subjectName: string;
  unitId: string;
  unitName: string;
  topicId: string | null;
  topicName: string | null;
  year: number | null;
  source: string | null;
}

/** Server-only: includes the answer key. NEVER send to the browser during a mock. */
export interface FullQuestion extends PaperQuestion {
  correctAnswer: unknown;
  solution: string | null;
}

/** What the browser sees while the mock runs — no answer key, no subject/unit labels. */
export interface MockQuestionDTO {
  position: number;
  id: string;
  type: QuestionType;
  marks: number;
  section: SectionKey;
  statement: string;
  options: QuestionOption[] | null;
  markingNote: string;
}

export interface ClientAnswerState {
  selected: RawAnswer;
  markedForReview: boolean;
  guessed: boolean;
  visited: boolean;
}

export interface SectionSummary {
  key: SectionKey;
  label: string;
  firstPosition: number;
  count: number;
  maxMarks: number;
}

/** GET /api/mocks/:id — everything the simulator needs to (re)start after a refresh or phone lock. */
export interface MockSessionSnapshot {
  id: string;
  title: string;
  status: MockStatus;
  durationSec: number;
  startedAtMs: number | null;
  deadlineAtMs: number | null;
  /** Server time at response. The client derives its clock offset from this. */
  serverNowMs: number;
  lastSeq: number;
  sections: SectionSummary[];
  markingRules: string[];
  /** Empty until the mock has started. */
  questions: MockQuestionDTO[];
  answers: Record<string, ClientAnswerState>;
}

export interface AutosaveAck {
  accepted: number;
  rejected: number;
  lastSeq: number;
  status: MockStatus;
  serverNowMs: number;
  deadlineAtMs: number | null;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export type Outcome = 'CORRECT' | 'WRONG' | 'UNANSWERED';

export interface GroupRow {
  key: string;
  label: string;
  total: number;
  attempted: number;
  correct: number;
  wrong: number;
  unanswered: number;
  marksObtained: number;
  marksAvailable: number;
  negativeMarks: number;
  /** correct / attempted (null when nothing was attempted) */
  accuracy: number | null;
  attemptRate: number;
  /** marksObtained / marksAvailable */
  scoreShare: number;
  avgSec: number;
}

export interface PerQuestionRow {
  position: number;
  questionId: string;
  section: SectionKey;
  type: QuestionType;
  subjectName: string;
  unitName: string;
  topicName: string | null;
  marksAvailable: number;
  marksObtained: number;
  outcome: Outcome;
  spentSec: number;
  markedForReview: boolean;
  guessed: boolean;
  changedAnswer: boolean;
  finalAnswer: RawAnswer;
  firstAnswer: RawAnswer;
  wasSeenBefore: boolean;
}

export interface MockAnalytics {
  version: string;
  score: { obtained: number; max: number; share: number; gained: number; negative: number };
  counts: { total: number; attempted: number; correct: number; wrong: number; unanswered: number };
  accuracy: number | null;
  attemptRate: number;
  time: {
    allottedSec: number;
    usedSec: number;
    unusedSec: number;
    accountedSec: number;
    avgSecPerQuestion: number;
    avgSecPerAttempted: number | null;
    /** Seconds spent beyond the per-question budget on questions that earned nothing. */
    timeLostSec: number;
  };
  /** "Did changing answers help?" */
  answerChanges: {
    firstAttemptAccuracy: number | null;
    finalAccuracy: number | null;
    changedCount: number;
    changedAccuracy: number | null;
    unchangedAccuracy: number | null;
    wrongToRight: number;
    rightToWrong: number;
    wrongToWrong: number;
    clearedToBlank: number;
    netMarks: number;
  };
  guessing: {
    guessedAttempted: number;
    guessRate: number | null;
    guessedCorrect: number;
    guessAccuracy: number | null;
    netMarks: number;
  };
  reviewed: {
    marked: number;
    markedAttempted: number;
    markedCorrect: number;
    accuracy: number | null;
  };
  bySection: GroupRow[];
  bySubject: GroupRow[];
  byUnit: GroupRow[];
  byTopic: GroupRow[];
  byType: GroupRow[];
  byMarks: GroupRow[];
  perQuestion: PerQuestionRow[];
}

export interface ReviewRow extends PerQuestionRow {
  statement: string;
  options: QuestionOption[] | null;
  correctAnswer: unknown;
  solution: string | null;
  year: number | null;
  source: string | null;
}

export interface MockResultView {
  id: string;
  title: string;
  examYear: number;
  submittedAtMs: number;
  submitReason: SubmitReason;
  questionCount: number;
  freshCount: number;
  analytics: MockAnalytics;
  review: ReviewRow[];
  /** Score share of the previous submitted mock, for the delta on the score tile. */
  previousScoreShare: number | null;
}

// ── Listing ──────────────────────────────────────────────────────────────────

export interface MockListItem {
  id: string;
  title: string;
  status: MockStatus;
  createdAtMs: number;
  startedAtMs: number | null;
  deadlineAtMs: number | null;
  submittedAtMs: number | null;
  questionCount: number;
  freshCount: number;
  score: number | null;
  maxMarks: number;
  accuracy: number | null;
  attemptRate: number | null;
}

export interface BlueprintSummary {
  key: string;
  title: string;
  examYear: number;
  durationSec: number;
  totalQuestions: number;
  totalMarks: number;
}

export interface MockListing {
  serverNowMs: number;
  blueprints: BlueprintSummary[];
  active: MockListItem | null;
  ready: MockListItem[];
  history: MockListItem[];
  readiness: MockReadiness;
}

/** Consumed by the Part 5 planner ("Mocks 2/8", mock readiness). Never a rank or score prediction. */
export interface MockReadiness {
  completed: number;
  recommended: number;
  lastScoreShare: number | null;
  averageScoreShare: number | null;
  lastSubmittedAtMs: number | null;
}

// ── Errors (mapped to HTTP status in app/api/mocks/_lib/http.ts) ─────────────

export class MockNotFoundError extends Error {
  readonly code = 'MOCK_NOT_FOUND';
  constructor(id: string) {
    super(`Mock ${id} not found`);
  }
}

export class MockStateError extends Error {
  constructor(
    readonly code: 'MOCK_SUBMITTED' | 'MOCK_NOT_STARTED' | 'MOCK_NOT_SUBMITTED',
    message: string,
  ) {
    super(message);
  }
}

export class ActiveMockExistsError extends Error {
  readonly code = 'ACTIVE_MOCK_EXISTS';
  constructor(readonly activeMockId: string) {
    super('Another mock is already in progress. Finish or submit it first.');
  }
}

export interface Shortfall {
  section: SectionKey;
  marks: number;
  needed: number;
  available: number;
}

export class InsufficientQuestionBankError extends Error {
  readonly code = 'INSUFFICIENT_QUESTION_BANK';
  constructor(readonly shortfalls: Shortfall[]) {
    super(
      'The question bank cannot fill this paper: ' +
        shortfalls
          .map((s) => `${s.section} ${s.marks}-mark needs ${s.needed}, has ${s.available}`)
          .join('; '),
    );
  }
}

export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED';
  constructor() {
    super('Not signed in');
  }
}
