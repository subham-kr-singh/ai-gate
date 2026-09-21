import { ANALYTICS_VERSION, computeMockAnalytics, type GradedItem } from './mock.analytics';
import { assemblePaper } from './mock.assembly';
import {
  BLUEPRINTS,
  DEFAULT_BLUEPRINT_KEY,
  RECOMMENDED_MOCK_COUNT,
  blueprintTotals,
  markingNote,
  markingRules,
  type MockBlueprint,
} from './mock.blueprint';
import type {
  FinalizeData,
  MockPorts,
  MockRecord,
  MockRepository,
  PaperItemRecord,
} from './mock.ports';
import { emptyState, normalizeAnswer, type AnswerStateRecord } from './mock.reducer';
import {
  LATE_SYNC_WINDOW_MS,
  computeDeadline,
  judgeEvent,
  shouldServerFinalize,
} from './mock.timer';
import {
  ActiveMockExistsError,
  MockNotFoundError,
  MockStateError,
  type AutosaveAck,
  type BlueprintSummary,
  type ClientAnswerState,
  type FullQuestion,
  type MockEventInput,
  type MockListItem,
  type MockListing,
  type MockQuestionDTO,
  type MockReadiness,
  type MockResultView,
  type MockSessionSnapshot,
  type PaperQuestion,
  type RawAnswer,
  type ReviewRow,
  type SectionSummary,
  type SubmitReason,
} from './mock.types';

/**
 * Orchestration only. No SQL, no HTTP, no React. Business rules live in the pure modules
 * (assembly, timer, reducer, analytics); IO lives behind MockRepository / MockPorts.
 *
 * The clock rule: THE SERVER decides when a mock ends. `deadlineAt` is written once, at
 * start. Everything else (autosave acceptance, submit, lazy expiry) is compared against it.
 */

const LEARNING_LEASE_MS = 2 * 60_000;
const RESUME_ANNOUNCE_AFTER_MS = 30_000;

export interface MockServiceDeps {
  repo: MockRepository;
  ports: MockPorts;
  now?: () => number;
  blueprints?: Record<string, MockBlueprint>;
  newSeed?: () => string;
}

export class MockService {
  private readonly repo: MockRepository;
  private readonly ports: MockPorts;
  private readonly now: () => number;
  private readonly blueprints: Record<string, MockBlueprint>;
  private readonly newSeed: () => string;

  constructor(deps: MockServiceDeps) {
    this.repo = deps.repo;
    this.ports = deps.ports;
    this.now = deps.now ?? Date.now;
    this.blueprints = deps.blueprints ?? BLUEPRINTS;
    this.newSeed = deps.newSeed ?? (() => globalThis.crypto.randomUUID());
  }

  // ── listing ────────────────────────────────────────────────────────────────

  listBlueprints(): BlueprintSummary[] {
    return Object.values(this.blueprints).map((bp) => ({
      key: bp.key,
      title: bp.title,
      examYear: bp.examYear,
      durationSec: bp.durationSec,
      ...blueprintTotals(bp),
    }));
  }

  async list(userId: string): Promise<MockListing> {
    await this.finalizeExpired(userId);
    await this.retryPendingLearning(userId);

    const rows = await this.repo.listForUser(userId, 200);
    const items = rows.map(toListItem);
    return {
      serverNowMs: this.now(),
      blueprints: this.listBlueprints(),
      active: items.find((m) => m.status === 'IN_PROGRESS') ?? null,
      ready: items.filter((m) => m.status === 'READY'),
      history: items.filter((m) => m.status === 'SUBMITTED'),
      readiness: computeReadiness(rows),
    };
  }

  async getReadiness(userId: string): Promise<MockReadiness> {
    return computeReadiness(await this.repo.listForUser(userId, 200));
  }

  // ── create / start ─────────────────────────────────────────────────────────

  /** Assemble a paper. The clock does NOT start until `start()`. */
  async create(
    userId: string,
    opts: { blueprintKey?: string; preferUnseen?: boolean } = {},
  ): Promise<{ id: string; freshCount: number }> {
    const bp = this.blueprint(opts.blueprintKey ?? DEFAULT_BLUEPRINT_KEY);
    const candidates = await this.ports.questions.loadCandidates(userId);
    const seed = this.newSeed();
    const paper = assemblePaper(bp, candidates, { seed, preferUnseen: opts.preferUnseen ?? true });
    const { totalMarks } = blueprintTotals(bp);
    const existing = await this.repo.listForUser(userId, 500);

    const rec = await this.repo.create(
      {
        userId,
        title: `Full mock ${existing.length + 1}`,
        blueprintKey: bp.key,
        examYear: bp.examYear,
        syllabusVersionId: await this.ports.questions.currentSyllabusVersionId(),
        durationSec: bp.durationSec,
        assemblySeed: seed,
        assemblyVersion: paper.version,
        questionCount: paper.items.length,
        maxMarks: totalMarks,
        freshCount: paper.freshCount,
      },
      paper.items.map<PaperItemRecord>((i) => ({
        position: i.position,
        questionId: i.questionId,
        section: i.section,
        marks: i.marks,
        type: i.type,
        wasSeenBefore: i.seenBefore,
      })),
    );
    return { id: rec.id, freshCount: paper.freshCount };
  }

  /** Starts the server clock. Idempotent: starting a running mock returns the same deadline. */
  async start(userId: string, id: string): Promise<MockSessionSnapshot> {
    let m = await this.mustGet(userId, id);
    m = await this.settle(m);
    if (m.status === 'SUBMITTED') throw new MockStateError('MOCK_SUBMITTED', 'This mock is already submitted.');

    if (m.status === 'READY') {
      await this.finalizeExpired(userId);
      const active = await this.repo.findInProgress(userId);
      if (active && active.id !== id) throw new ActiveMockExistsError(active.id);

      const startedAt = this.now();
      const started = await this.repo.start(
        id,
        new Date(startedAt),
        new Date(computeDeadline(startedAt, m.durationSec)),
      );
      if (started) {
        await this.track('TEST_STARTED', { mockId: id, userId, durationSec: m.durationSec });
      }
    }
    return this.getSession(userId, id);
  }

  // ── session (refresh / phone-lock resume) ──────────────────────────────────

  async getSession(userId: string, id: string): Promise<MockSessionSnapshot> {
    let m = await this.mustGet(userId, id);
    m = await this.settle(m);
    const bp = this.blueprint(m.blueprintKey);
    const items = await this.repo.getItems(id);
    const sections = summariseSections(items, bp);

    let questions: MockQuestionDTO[] = [];
    let answers: Record<string, ClientAnswerState> = {};
    if (m.status === 'IN_PROGRESS') {
      const full = new Map((await this.ports.questions.loadFull(items.map((i) => i.questionId))).map((q) => [q.id, q]));
      questions = items.map((it) => {
        const q = full.get(it.questionId);
        return {
          position: it.position,
          id: it.questionId,
          type: it.type,
          marks: it.marks,
          section: it.section,
          statement: q?.statement ?? '(question unavailable)',
          options: q?.options ?? null,
          markingNote: markingNote(bp, it.type, it.marks),
        };
      });
      const states = new Map((await this.repo.getStates(id)).map((s) => [s.questionId, s]));
      for (const it of items) {
        const s = states.get(it.questionId);
        answers[it.questionId] = {
          selected: s?.selected ?? null,
          markedForReview: s?.markedForReview ?? false,
          guessed: s?.guessed ?? false,
          visited: (s?.visitCount ?? 0) > 0,
        };
      }
      if (m.startedAt && this.now() - m.startedAt.getTime() > RESUME_ANNOUNCE_AFTER_MS) {
        await this.track('TEST_RESUMED', { mockId: id, userId });
      }
    }

    return {
      id: m.id,
      title: m.title,
      status: m.status,
      durationSec: m.durationSec,
      startedAtMs: m.startedAt?.getTime() ?? null,
      deadlineAtMs: m.deadlineAt?.getTime() ?? null,
      serverNowMs: this.now(),
      lastSeq: m.lastSeq,
      sections,
      markingRules: markingRules(bp),
      questions,
      answers,
    };
  }

  // ── autosave ───────────────────────────────────────────────────────────────

  /**
   * Seq-guarded, idempotent autosave. With `events: []` it doubles as a heartbeat: the client
   * uses the returned serverNowMs to re-calibrate its clock and learns if the mock was
   * finalised elsewhere.
   */
  async applyEvents(userId: string, id: string, events: MockEventInput[]): Promise<AutosaveAck> {
    let m = await this.mustGet(userId, id);
    m = await this.settle(m);
    if (m.status === 'READY') throw new MockStateError('MOCK_NOT_STARTED', 'Start the mock first.');
    return this.applyToRunning(m, events);
  }

  private async applyToRunning(m: MockRecord, events: MockEventInput[]): Promise<AutosaveAck> {
    const nowMs = this.now();
    const deadlineMs = m.deadlineAt?.getTime() ?? null;

    if (m.status === 'SUBMITTED' || deadlineMs === null) {
      return ack(nowMs, m, 0, events.length);
    }

    const accepted: MockEventInput[] = [];
    let rejected = 0;
    for (const ev of events) {
      if (judgeEvent({ deadlineAtMs: deadlineMs, nowMs, eventAtMs: ev.at }) === 'ACCEPT') accepted.push(ev);
      else rejected++;
    }

    const res = accepted.length
      ? await this.repo.applyEvents(m.id, accepted)
      : { applied: 0, duplicates: 0, unknownQuestion: 0, lastSeq: m.lastSeq, status: m.status };

    return {
      accepted: res.applied + res.duplicates,
      rejected: rejected + res.unknownQuestion,
      lastSeq: res.lastSeq,
      status: res.status,
      serverNowMs: nowMs,
      deadlineAtMs: deadlineMs,
    };
  }

  // ── submit ─────────────────────────────────────────────────────────────────

  /**
   * Idempotent. Any events still in the client's outbox ride along, so a flaky network at the
   * buzzer cannot lose the last answers. Grading is deterministic (Part 2) and happens here,
   * against the state the server actually persisted.
   */
  async submit(
    userId: string,
    id: string,
    input: { reason: 'USER' | 'TIMER'; events?: MockEventInput[] },
  ): Promise<{ status: 'SUBMITTED'; alreadySubmitted: boolean }> {
    let m = await this.mustGet(userId, id);
    m = await this.settle(m);
    if (m.status === 'SUBMITTED') return { status: 'SUBMITTED', alreadySubmitted: true };
    if (m.status === 'READY') throw new MockStateError('MOCK_NOT_STARTED', 'Start the mock first.');

    if (input.events?.length) await this.applyToRunning(m, input.events);
    const won = await this.finalizeMock(m, input.reason);
    return { status: 'SUBMITTED', alreadySubmitted: !won };
  }

  // ── result ─────────────────────────────────────────────────────────────────

  async getResult(userId: string, id: string): Promise<MockResultView> {
    let m = await this.mustGet(userId, id);
    m = await this.settle(m);
    if (m.status !== 'SUBMITTED' || !m.result || !m.submittedAt) {
      throw new MockStateError('MOCK_NOT_SUBMITTED', 'This mock has not been submitted yet.');
    }
    await this.applyLearning(m.id); // no-op when already applied; heals a failed hand-off

    const full = new Map(
      (await this.ports.questions.loadFull(m.result.perQuestion.map((r) => r.questionId))).map((q) => [q.id, q]),
    );
    const review: ReviewRow[] = m.result.perQuestion.map((row) => {
      const q = full.get(row.questionId);
      return {
        ...row,
        statement: q?.statement ?? '(question unavailable)',
        options: q?.options ?? null,
        correctAnswer: q?.correctAnswer ?? null,
        solution: q?.solution ?? null,
        year: q?.year ?? null,
        source: q?.source ?? null,
      };
    });

    const earlier = (await this.repo.listForUser(userId, 200))
      .filter((r) => r.status === 'SUBMITTED' && r.result && r.submittedAt && r.submittedAt < m.submittedAt! && r.id !== m.id)
      .sort((a, b) => b.submittedAt!.getTime() - a.submittedAt!.getTime())[0];

    return {
      id: m.id,
      title: m.title,
      examYear: m.examYear,
      submittedAtMs: m.submittedAt.getTime(),
      submitReason: m.submitReason ?? 'USER',
      questionCount: m.questionCount,
      freshCount: m.freshCount,
      analytics: m.result,
      review,
      previousScoreShare: earlier?.result?.score.share ?? null,
    };
  }

  // ── maintenance (called lazily and from the daily job) ─────────────────────

  /** Finalise mocks nobody came back to (phone died, tab closed). Returns how many. */
  async finalizeExpired(userId?: string): Promise<number> {
    const cutoff = new Date(this.now() - LATE_SYNC_WINDOW_MS);
    const expired = await this.repo.findExpired(cutoff, userId);
    let n = 0;
    for (const m of expired) {
      if (await this.finalizeMock(m, 'EXPIRED_SERVER')) n++;
    }
    return n;
  }

  /** Heal failed learning-state hand-offs. Safe to run repeatedly. */
  async retryPendingLearning(userId?: string): Promise<number> {
    const pending = await this.repo.listPendingLearning(new Date(this.now()), LEARNING_LEASE_MS, 10, userId);
    let n = 0;
    for (const m of pending) if (await this.applyLearning(m.id)) n++;
    return n;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private blueprint(key: string): MockBlueprint {
    const bp = this.blueprints[key];
    if (!bp) throw new Error(`Unknown mock blueprint: ${key}`);
    return bp;
  }

  private async mustGet(userId: string, id: string): Promise<MockRecord> {
    const m = await this.repo.get(userId, id);
    if (!m) throw new MockNotFoundError(id);
    return m;
  }

  /** Lazy expiry: if the late-sync window has closed, finalise now and return the fresh record. */
  private async settle(m: MockRecord): Promise<MockRecord> {
    if (m.status === 'IN_PROGRESS' && m.deadlineAt && shouldServerFinalize(m.deadlineAt.getTime(), this.now())) {
      await this.finalizeMock(m, 'EXPIRED_SERVER');
      return (await this.repo.getById(m.id)) ?? m;
    }
    return m;
  }

  private async finalizeMock(m: MockRecord, reason: SubmitReason): Promise<boolean> {
    const bp = this.blueprint(m.blueprintKey);
    const items = await this.repo.getItems(m.id);
    const full = new Map((await this.ports.questions.loadFull(items.map((i) => i.questionId))).map((q) => [q.id, q]));

    const nowMs = this.now();
    const startedMs = m.startedAt?.getTime() ?? nowMs;
    const deadlineMs = m.deadlineAt?.getTime() ?? startedMs + m.durationSec * 1000;
    const endedMs = Math.min(nowMs, deadlineMs);
    const usedSec = Math.max(0, Math.round((endedMs - startedMs) / 1000));

    const won = await this.repo.finalize(m.id, (states): FinalizeData => {
      const byQ = new Map(states.map((s) => [s.questionId, s]));
      const graded = items.map((it) =>
        this.gradeItem(it, full.get(it.questionId), byQ.get(it.questionId) ?? emptyState(it.questionId), m.examYear),
      );
      const analytics = computeMockAnalytics(graded, {
        durationSec: m.durationSec,
        usedSec,
        expectedSecPerMark: bp.expectedSecPerMark,
        sectionLabels: { GA: bp.sections[0]!.label, CORE: bp.sections[1]?.label ?? 'Core' },
      });
      return {
        submittedAt: new Date(reason === 'EXPIRED_SERVER' ? deadlineMs : nowMs),
        reason,
        score: analytics.score.obtained,
        analytics,
        analyticsVersion: ANALYTICS_VERSION,
        firstAnswerFills: states
          .filter((s) => s.firstAnswer === null && s.selected !== null)
          .map((s) => ({ questionId: s.questionId, firstAnswer: s.selected })),
      };
    });

    if (won) {
      await this.track('TEST_SUBMITTED', { mockId: m.id, userId: m.userId, reason });
      await this.applyLearning(m.id);
    }
    return won;
  }

  private gradeItem(
    item: PaperItemRecord,
    q: FullQuestion | undefined,
    st: AnswerStateRecord,
    examYear: number,
  ): GradedItem {
    // A deleted question must never block a submission: it scores as unanswered.
    const meta: PaperQuestion = q ?? {
      id: item.questionId,
      type: item.type,
      marks: item.marks,
      section: item.section,
      statement: '',
      options: null,
      subjectId: 'unknown',
      subjectName: 'Unknown',
      unitId: 'unknown',
      unitName: 'Unknown',
      topicId: null,
      topicName: null,
      year: null,
      source: null,
    };
    const finalAnswer = normalizeAnswer(st.selected);
    const firstAnswer = normalizeAnswer(st.firstAnswer) ?? finalAnswer;

    const gradeOf = (a: RawAnswer) => {
      if (a === null || !q) return { attempted: false, correct: false, marks: 0 };
      const g = this.ports.grading.grade(q, a, { examYear });
      return { attempted: true, correct: g.correct, marks: g.marks };
    };
    const fin = gradeOf(finalAnswer);
    const fst = gradeOf(firstAnswer);

    return {
      position: item.position,
      question: meta,
      wasSeenBefore: item.wasSeenBefore,
      finalAnswer,
      firstAnswer,
      attempted: fin.attempted,
      correct: fin.correct,
      marks: fin.marks,
      firstAttempted: fst.attempted,
      firstCorrect: fst.correct,
      firstMarks: fst.marks,
      markedForReview: st.markedForReview,
      guessed: st.guessed,
      spentMs: st.spentMs,
    };
  }

  /** Push a graded mock into attempts + learning state exactly once (lease + idempotent sink). */
  private async applyLearning(mockId: string): Promise<boolean> {
    const m = await this.repo.getById(mockId);
    if (!m || m.status !== 'SUBMITTED' || !m.result || !m.submittedAt || m.learningAppliedAt) return false;
    const nowDate = new Date(this.now());
    if (!(await this.repo.claimLearning(mockId, nowDate, LEARNING_LEASE_MS))) return false;
    try {
      await this.ports.learning.recordMockAttempts({
        userId: m.userId,
        mockId,
        examYear: m.examYear,
        submittedAt: m.submittedAt,
        answers: m.result.perQuestion.map((r) => ({
          questionId: r.questionId,
          selected: r.finalAnswer,
          attempted: r.outcome !== 'UNANSWERED',
          correct: r.outcome === 'CORRECT',
          marks: r.marksObtained,
          timeTakenMs: r.spentSec * 1000,
          confidence: r.guessed ? 1 : null,
          markedForReview: r.markedForReview,
        })),
      });
      await this.repo.markLearningApplied(mockId, new Date(this.now()));
      return true;
    } catch (err) {
      // Lease expires → the job / next page load retries. The score itself is already safe.
      console.error(`[mock ${mockId}] learning-state hand-off failed; will retry`, err);
      return false;
    }
  }

  private async track(event: 'TEST_STARTED' | 'TEST_RESUMED' | 'TEST_SUBMITTED', payload: Record<string, unknown>) {
    try {
      await this.ports.analytics?.track(event, payload);
    } catch (err) {
      console.error(`[mock] analytics ${event} failed`, err);
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function ack(nowMs: number, m: MockRecord, accepted: number, rejected: number): AutosaveAck {
  return {
    accepted,
    rejected,
    lastSeq: m.lastSeq,
    status: m.status,
    serverNowMs: nowMs,
    deadlineAtMs: m.deadlineAt?.getTime() ?? null,
  };
}

function summariseSections(items: PaperItemRecord[], bp: MockBlueprint): SectionSummary[] {
  return bp.sections
    .map((s) => {
      const mine = items.filter((i) => i.section === s.key);
      return {
        key: s.key,
        label: s.label,
        firstPosition: mine[0]?.position ?? 0,
        count: mine.length,
        maxMarks: mine.reduce((n, i) => n + i.marks, 0),
      };
    })
    .filter((s) => s.count > 0);
}

function toListItem(m: MockRecord): MockListItem {
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    createdAtMs: m.createdAt.getTime(),
    startedAtMs: m.startedAt?.getTime() ?? null,
    deadlineAtMs: m.deadlineAt?.getTime() ?? null,
    submittedAtMs: m.submittedAt?.getTime() ?? null,
    questionCount: m.questionCount,
    freshCount: m.freshCount,
    score: m.score,
    maxMarks: m.maxMarks,
    accuracy: m.result?.accuracy ?? null,
    attemptRate: m.result?.attemptRate ?? null,
  };
}

function computeReadiness(rows: MockRecord[]): MockReadiness {
  const done = rows
    .filter((r) => r.status === 'SUBMITTED' && r.result && r.submittedAt)
    .sort((a, b) => b.submittedAt!.getTime() - a.submittedAt!.getTime());
  const shares = done.map((r) => r.result!.score.share);
  return {
    completed: done.length,
    recommended: RECOMMENDED_MOCK_COUNT,
    lastScoreShare: shares[0] ?? null,
    averageScoreShare: shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null,
    lastSubmittedAtMs: done[0]?.submittedAt?.getTime() ?? null,
  };
}
