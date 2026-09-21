import type { Candidate } from './mock.assembly';
import type { AnswerStateRecord } from './mock.reducer';
import type {
  FullQuestion,
  MockAnalytics,
  MockEventInput,
  MockStatus,
  QuestionType,
  RawAnswer,
  SectionKey,
  SubmitReason,
} from './mock.types';

/**
 * The seams. mock.service.ts depends ONLY on these interfaces, never on Prisma or on the
 * concrete Part 1–5 services. The real implementations are wired in mock.context.ts — the
 * one file you may need to adapt to your Part 2/3 signatures.
 */

// ── Part 2: question bank + grading ──────────────────────────────────────────

export interface QuestionSource {
  /** APPROVED questions only (trusted answer keys), with the student's seen-history attached. */
  loadCandidates(userId: string): Promise<Candidate[]>;
  /** Full content including the answer key. Server-only. */
  loadFull(ids: string[]): Promise<FullQuestion[]>;
  /** Syllabus version active now, so a mock stays tied to the syllabus it was built from. */
  currentSyllabusVersionId(): Promise<string | null>;
}

export interface GradeOutcome {
  correct: boolean;
  /** Marks awarded. Negative for a wrong MCQ. */
  marks: number;
}

/** Wraps Part 2's deterministic grading. Only called with a non-empty answer. */
export interface GradingPort {
  grade(
    question: FullQuestion,
    answer: Exclude<RawAnswer, null>,
    ctx: { examYear: number },
  ): GradeOutcome;
}

// ── Part 2/3: attempts, mistakes, mastery ────────────────────────────────────

export interface LearningAnswer {
  questionId: string;
  selected: RawAnswer;
  attempted: boolean;
  correct: boolean;
  marks: number;
  timeTakenMs: number;
  /** 1 = "guessed" on the architecture's 1–4 confidence scale; null = not reported. */
  confidence: 1 | null;
  markedForReview: boolean;
}

/**
 * Feeds graded mock answers into the append-only attempt history and the learning state
 * (mastery / mistakes / retention). CONTRACT: must be idempotent per `mockId`.
 */
export interface LearningSink {
  recordMockAttempts(input: {
    userId: string;
    mockId: string;
    examYear: number;
    submittedAt: Date;
    answers: LearningAnswer[];
  }): Promise<void>;
}

/** Part 3's analytics event log (TEST_STARTED / TEST_RESUMED / TEST_SUBMITTED). Optional. */
export interface AnalyticsPort {
  track(
    event: 'TEST_STARTED' | 'TEST_RESUMED' | 'TEST_SUBMITTED',
    payload: Record<string, unknown>,
  ): void | Promise<void>;
}

export interface MockPorts {
  questions: QuestionSource;
  grading: GradingPort;
  learning: LearningSink;
  analytics?: AnalyticsPort;
}

// ── Persistence contract (Prisma in prod, in-memory in tests) ────────────────

export interface MockRecord {
  id: string;
  userId: string;
  title: string;
  blueprintKey: string;
  examYear: number;
  syllabusVersionId: string | null;
  status: MockStatus;
  durationSec: number;
  startedAt: Date | null;
  deadlineAt: Date | null;
  submittedAt: Date | null;
  submitReason: SubmitReason | null;
  lastSeq: number;
  assemblySeed: string;
  assemblyVersion: string;
  questionCount: number;
  maxMarks: number;
  freshCount: number;
  score: number | null;
  result: MockAnalytics | null;
  learningAppliedAt: Date | null;
  createdAt: Date;
}

export interface NewMock {
  userId: string;
  title: string;
  blueprintKey: string;
  examYear: number;
  syllabusVersionId: string | null;
  durationSec: number;
  assemblySeed: string;
  assemblyVersion: string;
  questionCount: number;
  maxMarks: number;
  freshCount: number;
}

export interface PaperItemRecord {
  position: number;
  questionId: string;
  section: SectionKey;
  marks: number;
  type: QuestionType;
  wasSeenBefore: boolean;
}

export interface ApplyResult {
  applied: number;
  duplicates: number;
  unknownQuestion: number;
  lastSeq: number;
  status: MockStatus;
}

export interface FinalizeData {
  submittedAt: Date;
  reason: SubmitReason;
  score: number;
  analytics: MockAnalytics;
  analyticsVersion: string;
  /** States that had a selection but never a LEAVE: firstAnswer := selected. */
  firstAnswerFills: { questionId: string; firstAnswer: RawAnswer }[];
}

export interface MockRepository {
  create(data: NewMock, items: PaperItemRecord[]): Promise<MockRecord>;
  get(userId: string, id: string): Promise<MockRecord | null>;
  getById(id: string): Promise<MockRecord | null>;
  listForUser(userId: string, limit: number): Promise<MockRecord[]>;
  findInProgress(userId: string): Promise<MockRecord | null>;
  /** IN_PROGRESS mocks whose deadline is before `deadlineBefore`. */
  findExpired(deadlineBefore: Date, userId?: string): Promise<MockRecord[]>;
  getItems(mockId: string): Promise<PaperItemRecord[]>;
  getStates(mockId: string): Promise<AnswerStateRecord[]>;

  /** READY → IN_PROGRESS. False if it was not READY (already started). */
  start(id: string, startedAt: Date, deadlineAt: Date): Promise<boolean>;

  /**
   * Atomically (row-locked) log + apply events. Duplicate seqs are ignored (idempotent);
   * events for questions not in the paper are dropped; no-op unless IN_PROGRESS.
   */
  applyEvents(id: string, events: MockEventInput[]): Promise<ApplyResult>;

  /**
   * IN_PROGRESS → SUBMITTED. Locks the mock row, reads the FINAL states, and hands them to the
   * synchronous `build` so the stored result is computed from exactly what was persisted.
   * Returns false if someone else already finalised it (idempotent submit).
   */
  finalize(id: string, build: (states: AnswerStateRecord[]) => FinalizeData): Promise<boolean>;

  /** Lease-based claim so two processes never push the same mock into learning state at once. */
  claimLearning(id: string, now: Date, leaseMs: number): Promise<boolean>;
  markLearningApplied(id: string, at: Date): Promise<void>;
  listPendingLearning(now: Date, leaseMs: number, limit: number, userId?: string): Promise<MockRecord[]>;
}
