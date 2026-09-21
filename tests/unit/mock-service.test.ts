import { describe, expect, it } from 'vitest';
import { MockService } from '@/server/domains/tests/mock.service';
import { LATE_SYNC_WINDOW_MS } from '@/server/domains/tests/mock.timer';
import {
  ActiveMockExistsError,
  MockNotFoundError,
  MockStateError,
  type MockEventInput,
  type MockQuestionDTO,
} from '@/server/domains/tests/mock.types';
import { MemoryMockRepo, fakePorts } from '../helpers/mock-memory';

const USER = 'u1';
const HOUR = 3_600_000;

function setup() {
  let t = Date.UTC(2026, 8, 20, 10, 0, 0);
  const clock = () => t;
  const repo = new MemoryMockRepo(clock);
  const fp = fakePorts();
  const svc = new MockService({ repo, ports: fp.ports, now: clock, newSeed: () => 'seed-1' });
  let seq = 0;
  const ev = (questionId: string, kind: MockEventInput['kind'], extra: Partial<MockEventInput> = {}): MockEventInput => ({
    seq: ++seq, questionId, kind, at: t, ...extra,
  });
  return { svc, repo, fp, ev, advance: (ms: number) => (t += ms), now: () => t, resetSeq: () => (seq = 0) };
}

async function startedMock(s: ReturnType<typeof setup>) {
  const { id } = await s.svc.create(USER);
  const session = await s.svc.start(USER, id);
  return { id, session };
}

const byType = (qs: MockQuestionDTO[], type: string) => qs.filter((q) => q.type === type);

describe('create + start', () => {
  it('assembles a paper but does NOT start the clock, and withholds questions until start', async () => {
    const s = setup();
    const { id } = await s.svc.create(USER);
    const snap = await s.svc.getSession(USER, id);
    expect(snap.status).toBe('READY');
    expect(snap.deadlineAtMs).toBeNull();
    expect(snap.questions).toHaveLength(0);
    expect(snap.sections.map((x) => x.count)).toEqual([10, 55]);
    expect(snap.markingRules.length).toBeGreaterThan(2);
  });

  it('start sets the deadline on the server and is idempotent', async () => {
    const s = setup();
    const { id, session } = await startedMock(s);
    expect(session.status).toBe('IN_PROGRESS');
    expect(session.deadlineAtMs).toBe(s.now() + 3 * HOUR);
    s.advance(20 * 60_000);
    const again = await s.svc.start(USER, id);
    expect(again.deadlineAtMs).toBe(session.deadlineAtMs); // clock did NOT restart
    expect(s.fp.events.filter((e) => e === 'TEST_STARTED')).toHaveLength(1);
  });

  it('never leaks the answer key, solution or topic labels while the mock runs', async () => {
    const s = setup();
    const { session } = await startedMock(s);
    const json = JSON.stringify(session);
    expect(session.questions).toHaveLength(65);
    expect(json).not.toContain('correctAnswer');
    expect(json).not.toContain('Solution q');
    expect(json).not.toContain('subjectName');
    expect(session.questions[0]!.markingNote).toContain('correct');
  });

  it('allows only one mock in progress at a time', async () => {
    const s = setup();
    await startedMock(s);
    const second = await s.svc.create(USER);
    await expect(s.svc.start(USER, second.id)).rejects.toBeInstanceOf(ActiveMockExistsError);
  });

  it('scopes mocks to their owner', async () => {
    const s = setup();
    const { id } = await s.svc.create(USER);
    await expect(s.svc.getSession('someone-else', id)).rejects.toBeInstanceOf(MockNotFoundError);
  });
});

describe('autosave + resume (refresh / phone lock)', () => {
  it('persists answers and restores them, with remaining time derived from the deadline', async () => {
    const s = setup();
    const { id, session } = await startedMock(s);
    const [q1, q2] = session.questions;
    await s.svc.applyEvents(USER, id, [
      s.ev(q1!.id, 'VISIT'), s.ev(q1!.id, 'SELECT', { selected: 'B' }), s.ev(q1!.id, 'MARK'),
      s.ev(q2!.id, 'VISIT'), s.ev(q2!.id, 'SELECT', { selected: 'A' }),
    ]);
    s.advance(40 * 60_000); // phone locked for 40 minutes; JS timers frozen
    const resumed = await s.svc.getSession(USER, id);
    expect(resumed.deadlineAtMs! - resumed.serverNowMs).toBe(140 * 60_000);
    expect(resumed.answers[q1!.id]).toMatchObject({ selected: 'B', markedForReview: true, visited: true });
    expect(resumed.answers[q2!.id]).toMatchObject({ selected: 'A', markedForReview: false });
    expect(resumed.lastSeq).toBe(5);
    expect(s.fp.events).toContain('TEST_RESUMED');
  });

  it('is idempotent: replaying a batch changes nothing and never double-counts time', async () => {
    const s = setup();
    const { id, session } = await startedMock(s);
    const q = session.questions[0]!.id;
    const batch = [s.ev(q, 'VISIT'), s.ev(q, 'SELECT', { selected: 'A' }), s.ev(q, 'LEAVE', { spentMs: 30_000 })];
    const a1 = await s.svc.applyEvents(USER, id, batch);
    const a2 = await s.svc.applyEvents(USER, id, batch);
    expect(a1.accepted).toBe(3);
    expect(a2.accepted).toBe(3);
    expect(s.repo.states.get(id)!.get(q)).toMatchObject({ spentMs: 30_000, visitCount: 1, firstAnswer: 'A' });
  });

  it('an older request never overwrites a newer answer (seq guard)', async () => {
    const s = setup();
    const { id, session } = await startedMock(s);
    const q = session.questions[0]!.id;
    const e41 = s.ev(q, 'SELECT', { selected: 'A' });
    const e42 = s.ev(q, 'SELECT', { selected: 'C' });
    await s.svc.applyEvents(USER, id, [e42]); // newer arrives first
    await s.svc.applyEvents(USER, id, [e41]); // delayed older one
    expect(s.repo.states.get(id)!.get(q)!.selected).toBe('C');
  });

  it('drops events for questions that are not in the paper', async () => {
    const s = setup();
    const { id } = await startedMock(s);
    const r = await s.svc.applyEvents(USER, id, [s.ev('not-a-question', 'SELECT', { selected: 'A' })]);
    expect(r.rejected).toBe(1);
    expect(r.accepted).toBe(0);
  });

  it('an empty batch is a heartbeat that returns server time and deadline', async () => {
    const s = setup();
    const { id, session } = await startedMock(s);
    s.advance(5_000);
    const hb = await s.svc.applyEvents(USER, id, []);
    expect(hb.serverNowMs).toBe(s.now());
    expect(hb.deadlineAtMs).toBe(session.deadlineAtMs);
    expect(hb.status).toBe('IN_PROGRESS');
  });

  it('rejects autosave before the mock has started', async () => {
    const s = setup();
    const { id } = await s.svc.create(USER);
    await expect(s.svc.applyEvents(USER, id, [])).rejects.toBeInstanceOf(MockStateError);
  });
});

describe('submit, grading and learning hand-off', () => {
  async function playedMock(s: ReturnType<typeof setup>) {
    const { id, session } = await startedMock(s);
    const mcq = byType(session.questions, 'MCQ');
    const nat = byType(session.questions, 'NAT');
    const msq = byType(session.questions, 'MSQ');
    const [a, b] = mcq;
    await s.svc.applyEvents(USER, id, [
      s.ev(a!.id, 'VISIT'), s.ev(a!.id, 'SELECT', { selected: 'B' }), s.ev(a!.id, 'LEAVE', { spentMs: 20_000 }), // first: wrong
      s.ev(a!.id, 'SELECT', { selected: 'A' }), // changed to right
      s.ev(b!.id, 'VISIT'), s.ev(b!.id, 'SELECT', { selected: 'C' }), s.ev(b!.id, 'GUESS'), s.ev(b!.id, 'LEAVE', { spentMs: 8_000 }), // wrong, guessed
      s.ev(nat[0]!.id, 'SELECT', { selected: '42' }), // right
      s.ev(msq[0]!.id, 'SELECT', { selected: ['A'] }), // wrong, no penalty
    ]);
    return { id, a: a!, b: b!, nat: nat[0]!, msq: msq[0]! };
  }

  it('grades deterministically with negative marking, and stores an immutable result', async () => {
    const s = setup();
    const { id, a, b, nat } = await playedMock(s);
    s.advance(90 * 60_000);
    const r = await s.svc.submit(USER, id, { reason: 'USER' });
    expect(r).toEqual({ status: 'SUBMITTED', alreadySubmitted: false });

    const res = await s.svc.getResult(USER, id);
    const expected = a.marks + -(b.marks / 3) + nat.marks;
    expect(res.analytics.score.obtained).toBeCloseTo(expected, 3);
    expect(res.analytics.counts).toMatchObject({ total: 65, attempted: 4, correct: 2, wrong: 2, unanswered: 61 });
    expect(res.analytics.time.usedSec).toBe(90 * 60);
    expect(res.submitReason).toBe('USER');
    // first answer (wrong) → final (right) was a helpful change
    expect(res.analytics.answerChanges.wrongToRight).toBe(1);
    expect(res.analytics.guessing.guessedAttempted).toBe(1);
    // review carries the key and solution only after submission
    const row = res.review.find((x) => x.questionId === a.id)!;
    expect(row.correctAnswer).toBe('A');
    expect(row.solution).toContain('Solution');
  });

  it('submit is idempotent and grades / records learning state exactly once', async () => {
    const s = setup();
    const { id } = await playedMock(s);
    const [x, y] = await Promise.all([
      s.svc.submit(USER, id, { reason: 'USER' }),
      s.svc.submit(USER, id, { reason: 'TIMER' }),
    ]);
    const z = await s.svc.submit(USER, id, { reason: 'USER' });
    expect([x.alreadySubmitted, y.alreadySubmitted].sort()).toEqual([false, true]);
    expect(z.alreadySubmitted).toBe(true);
    expect(s.fp.recorded).toHaveLength(1);
    expect(s.fp.recorded[0]!.answers).toHaveLength(65);
    expect(s.fp.recorded[0]!.answers.find((a) => a.confidence === 1)).toBeTruthy(); // the guess
    expect(s.fp.events.filter((e) => e === 'TEST_SUBMITTED')).toHaveLength(1);
  });

  it('carries unsynced outbox events inside the submit request (flaky network at the buzzer)', async () => {
    const s = setup();
    const { id, session } = await startedMock(s);
    const q = byType(session.questions, 'NAT')[0]!;
    const lateButInTime = s.ev(q.id, 'SELECT', { selected: '42' }); // stamped now (before deadline)
    s.advance(3 * HOUR + 2 * 60_000); // buzzer passed 2 min ago; phone reconnects only now
    await s.svc.submit(USER, id, { reason: 'TIMER', events: [lateButInTime] });
    const res = await s.svc.getResult(USER, id);
    expect(res.analytics.counts.correct).toBe(1);
    expect(res.analytics.time.usedSec).toBe(3 * 3600); // time used is capped at the deadline
  });

  it('rejects answers stamped after the deadline', async () => {
    const s = setup();
    const { id, session } = await startedMock(s);
    const q = byType(session.questions, 'NAT')[0]!;
    s.advance(3 * HOUR + 60_000);
    const tooLate = s.ev(q.id, 'SELECT', { selected: '42' }); // made AFTER time was up
    await s.svc.submit(USER, id, { reason: 'TIMER', events: [tooLate] });
    const res = await s.svc.getResult(USER, id);
    expect(res.analytics.counts.attempted).toBe(0);
  });

  it('finalises a mock nobody came back to, after deadline + late-sync window', async () => {
    const s = setup();
    const { id, session } = await startedMock(s);
    const q = byType(session.questions, 'NAT')[0]!;
    await s.svc.applyEvents(USER, id, [s.ev(q.id, 'SELECT', { selected: '42' })]);

    s.advance(3 * HOUR + 5 * 60_000);
    expect((await s.svc.getSession(USER, id)).status).toBe('IN_PROGRESS'); // still within the window

    s.advance(LATE_SYNC_WINDOW_MS);
    expect((await s.svc.getSession(USER, id)).status).toBe('SUBMITTED');
    const res = await s.svc.getResult(USER, id);
    expect(res.submitReason).toBe('EXPIRED_SERVER');
    expect(res.analytics.counts.correct).toBe(1);
    expect(s.fp.recorded).toHaveLength(1);
  });

  it('the daily job finalises expired mocks', async () => {
    const s = setup();
    const { id } = await startedMock(s);
    s.advance(3 * HOUR + LATE_SYNC_WINDOW_MS + 1);
    expect(await s.svc.finalizeExpired()).toBe(1);
    expect((await s.repo.getById(id))!.status).toBe('SUBMITTED');
    expect(await s.svc.finalizeExpired()).toBe(0);
  });

  it('a failed learning hand-off never loses the score, and heals on retry without double-counting', async () => {
    const s = setup();
    const { id } = await playedMock(s);
    s.fp.state.failLearning = 1;
    await s.svc.submit(USER, id, { reason: 'USER' });

    const rec = await s.repo.getById(id);
    expect(rec!.status).toBe('SUBMITTED');
    expect(rec!.learningAppliedAt).toBeNull();
    expect(s.fp.recorded).toHaveLength(0);

    expect(await s.svc.retryPendingLearning()).toBe(0); // lease still held
    s.advance(3 * 60_000);
    expect(await s.svc.retryPendingLearning()).toBe(1);
    expect(await s.svc.retryPendingLearning()).toBe(0);
    expect(s.fp.recorded).toHaveLength(1);
    expect((await s.repo.getById(id))!.learningAppliedAt).not.toBeNull();
  });

  it('result is unavailable until submitted; starting a submitted mock is refused', async () => {
    const s = setup();
    const { id } = await startedMock(s);
    await expect(s.svc.getResult(USER, id)).rejects.toBeInstanceOf(MockStateError);
    await s.svc.submit(USER, id, { reason: 'USER' });
    await expect(s.svc.start(USER, id)).rejects.toBeInstanceOf(MockStateError);
  });

  it('a deleted question scores as unanswered instead of blocking submission', async () => {
    const s = setup();
    const { id, session } = await startedMock(s);
    const victim = session.questions[3]!.id;
    s.fp.bank.full.delete(victim);
    await expect(s.svc.submit(USER, id, { reason: 'USER' })).resolves.toMatchObject({ status: 'SUBMITTED' });
  });
});

describe('listing, readiness and freshness', () => {
  it('lists active / ready / history and computes readiness without predicting rank', async () => {
    const s = setup();
    const first = await startedMock(s);
    await s.svc.submit(USER, first.id, { reason: 'USER' });
    s.advance(60_000);
    const second = await s.svc.create(USER);
    const listing = await s.svc.list(USER);
    expect(listing.history.map((h) => h.id)).toEqual([first.id]);
    expect(listing.ready.map((r) => r.id)).toEqual([second.id]);
    expect(listing.active).toBeNull();
    expect(listing.readiness).toMatchObject({ completed: 1, recommended: 8 });
    expect(Object.keys(listing.readiness)).not.toContain('predictedRank');
  });

  it('prefers unseen questions and reports how independent the mock is', async () => {
    const s = setup();
    const a = await s.svc.create(USER);
    expect(a.freshCount).toBe(65);
    // mark every other question as seen — fresh count must stay high while unseen supply lasts
    [...s.fp.bank.full.keys()].filter((_, i) => i % 2 === 0).forEach((k) => s.fp.state.seenIds.add(k));
    const b = await s.svc.create(USER);
    expect(b.freshCount).toBe(65);
  });

  it('previous mock score is exposed for the delta on the result page', async () => {
    const s = setup();
    const m1 = await startedMock(s);
    await s.svc.submit(USER, m1.id, { reason: 'USER' });
    s.advance(60_000);
    const m2 = await startedMock(s);
    await s.svc.submit(USER, m2.id, { reason: 'USER' });
    const res = await s.svc.getResult(USER, m2.id);
    expect(res.previousScoreShare).toBe(0);
    expect((await s.svc.getResult(USER, m1.id)).previousScoreShare).toBeNull();
  });
});
