import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  ApplyResult,
  FinalizeData,
  MockRecord,
  MockRepository,
  NewMock,
  PaperItemRecord,
} from './mock.ports';
import { emptyState, reduceEvent, type AnswerStateRecord } from './mock.reducer';
import type {
  MockAnalytics,
  MockEventInput,
  MockStatus,
  QuestionType,
  RawAnswer,
  SectionKey,
  SubmitReason,
} from './mock.types';

/**
 * Prisma adapter for MockRepository. All the interesting rules (seq guard, first-answer
 * capture) live in the pure reducer; this file only does IO and locking.
 *
 * Concurrency model: every write that touches a running mock first takes
 * `SELECT … FOR UPDATE` on its MockTest row, so an autosave batch, a retry of that batch,
 * and a submit can never interleave.
 */

type Tx = Prisma.TransactionClient;

const toJson = (v: RawAnswer): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);

const fromJson = (v: Prisma.JsonValue | null): RawAnswer =>
  v === null || v === undefined ? null : (v as string | string[]);

function toRecord(r: Prisma.MockTestGetPayload<object>): MockRecord {
  return {
    id: r.id,
    userId: r.userId,
    title: r.title,
    blueprintKey: r.blueprintKey,
    examYear: r.examYear,
    syllabusVersionId: r.syllabusVersionId,
    status: r.status as MockStatus,
    durationSec: r.durationSec,
    startedAt: r.startedAt,
    deadlineAt: r.deadlineAt,
    submittedAt: r.submittedAt,
    submitReason: (r.submitReason as SubmitReason | null) ?? null,
    lastSeq: r.lastSeq,
    assemblySeed: r.assemblySeed,
    assemblyVersion: r.assemblyVersion,
    questionCount: r.questionCount,
    maxMarks: r.maxMarks,
    freshCount: r.freshCount,
    score: r.score,
    result: (r.resultJson as unknown as MockAnalytics | null) ?? null,
    learningAppliedAt: r.learningAppliedAt,
    createdAt: r.createdAt,
  };
}

function toState(r: Prisma.MockAnswerStateGetPayload<object>): AnswerStateRecord {
  return {
    questionId: r.questionId,
    selected: fromJson(r.selected),
    firstAnswer: fromJson(r.firstAnswer),
    markedForReview: r.markedForReview,
    guessed: r.guessed,
    visitCount: r.visitCount,
    spentMs: r.spentMs,
    lastSeq: r.lastSeq,
  };
}

async function lockMock(tx: Tx, id: string): Promise<{ status: MockStatus; lastSeq: number } | null> {
  const rows = await tx.$queryRaw<{ status: string; lastSeq: number }[]>`
    SELECT "status"::text AS "status", "lastSeq" FROM "MockTest" WHERE "id" = ${id} FOR UPDATE`;
  const row = rows[0];
  return row ? { status: row.status as MockStatus, lastSeq: row.lastSeq } : null;
}

export class PrismaMockRepository implements MockRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(data: NewMock, items: PaperItemRecord[]): Promise<MockRecord> {
    const row = await this.db.mockTest.create({
      data: {
        ...data,
        items: { create: items.map((i) => ({ ...i })) },
      },
    });
    return toRecord(row);
  }

  async get(userId: string, id: string) {
    const r = await this.db.mockTest.findFirst({ where: { id, userId } });
    return r ? toRecord(r) : null;
  }

  async getById(id: string) {
    const r = await this.db.mockTest.findUnique({ where: { id } });
    return r ? toRecord(r) : null;
  }

  async listForUser(userId: string, limit: number) {
    const rows = await this.db.mockTest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toRecord);
  }

  async findInProgress(userId: string) {
    const r = await this.db.mockTest.findFirst({ where: { userId, status: 'IN_PROGRESS' } });
    return r ? toRecord(r) : null;
  }

  async findExpired(deadlineBefore: Date, userId?: string) {
    const rows = await this.db.mockTest.findMany({
      where: { status: 'IN_PROGRESS', deadlineAt: { lt: deadlineBefore }, ...(userId ? { userId } : {}) },
    });
    return rows.map(toRecord);
  }

  async getItems(mockId: string): Promise<PaperItemRecord[]> {
    const rows = await this.db.mockPaperItem.findMany({ where: { mockId }, orderBy: { position: 'asc' } });
    return rows.map((r) => ({
      position: r.position,
      questionId: r.questionId,
      section: r.section as SectionKey,
      marks: r.marks,
      type: r.type as QuestionType,
      wasSeenBefore: r.wasSeenBefore,
    }));
  }

  async getStates(mockId: string) {
    return (await this.db.mockAnswerState.findMany({ where: { mockId } })).map(toState);
  }

  async start(id: string, startedAt: Date, deadlineAt: Date) {
    const res = await this.db.mockTest.updateMany({
      where: { id, status: 'READY' },
      data: { status: 'IN_PROGRESS', startedAt, deadlineAt },
    });
    return res.count === 1;
  }

  async applyEvents(id: string, events: MockEventInput[]): Promise<ApplyResult> {
    return this.db.$transaction(async (tx) => {
      const locked = await lockMock(tx, id);
      if (!locked) throw new Error(`Mock ${id} vanished`);
      if (locked.status !== 'IN_PROGRESS') {
        return { applied: 0, duplicates: events.length, unknownQuestion: 0, lastSeq: locked.lastSeq, status: locked.status };
      }

      const known = new Set(
        (await tx.mockPaperItem.findMany({ where: { mockId: id }, select: { questionId: true } })).map((r) => r.questionId),
      );
      const already = new Set(
        (await tx.mockAnswerEvent.findMany({
          where: { mockId: id, seq: { in: events.map((e) => e.seq) } },
          select: { seq: true },
        })).map((r) => r.seq),
      );

      let duplicates = 0;
      let unknownQuestion = 0;
      const fresh: MockEventInput[] = [];
      const seenInBatch = new Set<number>();
      for (const ev of [...events].sort((a, b) => a.seq - b.seq)) {
        if (!known.has(ev.questionId)) unknownQuestion++;
        else if (already.has(ev.seq) || seenInBatch.has(ev.seq)) duplicates++;
        else {
          seenInBatch.add(ev.seq);
          fresh.push(ev);
        }
      }
      if (fresh.length === 0) {
        return { applied: 0, duplicates, unknownQuestion, lastSeq: locked.lastSeq, status: locked.status };
      }

      const qIds = [...new Set(fresh.map((e) => e.questionId))];
      const states = new Map(
        (await tx.mockAnswerState.findMany({ where: { mockId: id, questionId: { in: qIds } } })).map((r) => [r.questionId, toState(r)]),
      );
      const touched = new Set<string>();
      const logRows: Prisma.MockAnswerEventCreateManyInput[] = [];

      for (const ev of fresh) {
        const { state, applied } = reduceEvent(states.get(ev.questionId) ?? emptyState(ev.questionId), ev);
        if (applied) {
          states.set(ev.questionId, state);
          touched.add(ev.questionId);
        }
        logRows.push({
          mockId: id,
          seq: ev.seq,
          questionId: ev.questionId,
          kind: ev.kind,
          selected: ev.selected === undefined ? Prisma.DbNull : toJson(ev.selected),
          spentMs: Math.max(0, Math.round(ev.spentMs ?? 0)),
          clientAt: new Date(ev.at),
          applied,
        });
      }

      await tx.mockAnswerEvent.createMany({ data: logRows });
      for (const qid of touched) {
        const s = states.get(qid)!;
        const data = {
          selected: toJson(s.selected),
          firstAnswer: toJson(s.firstAnswer),
          markedForReview: s.markedForReview,
          guessed: s.guessed,
          visitCount: s.visitCount,
          spentMs: s.spentMs,
          lastSeq: s.lastSeq,
        };
        await tx.mockAnswerState.upsert({
          where: { mockId_questionId: { mockId: id, questionId: qid } },
          create: { mockId: id, questionId: qid, ...data },
          update: data,
        });
      }

      const maxSeq = Math.max(locked.lastSeq, ...fresh.map((e) => e.seq));
      await tx.mockTest.update({ where: { id }, data: { lastSeq: maxSeq } });
      return { applied: fresh.length, duplicates, unknownQuestion, lastSeq: maxSeq, status: locked.status };
    });
  }

  async finalize(id: string, build: (states: AnswerStateRecord[]) => FinalizeData): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const locked = await lockMock(tx, id);
      if (!locked || locked.status !== 'IN_PROGRESS') return false;

      const states = (await tx.mockAnswerState.findMany({ where: { mockId: id } })).map(toState);
      const d = build(states); // sync + pure: computed from exactly the rows we hold the lock on

      for (const f of d.firstAnswerFills) {
        await tx.mockAnswerState.update({
          where: { mockId_questionId: { mockId: id, questionId: f.questionId } },
          data: { firstAnswer: toJson(f.firstAnswer) },
        });
      }
      await tx.mockTest.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedAt: d.submittedAt,
          submitReason: d.reason,
          score: d.score,
          resultJson: d.analytics as unknown as Prisma.InputJsonValue,
          analyticsVersion: d.analyticsVersion,
        },
      });
      return true;
    });
  }

  async claimLearning(id: string, now: Date, leaseMs: number) {
    const res = await this.db.mockTest.updateMany({
      where: {
        id,
        status: 'SUBMITTED',
        learningAppliedAt: null,
        OR: [{ learningClaimedAt: null }, { learningClaimedAt: { lt: new Date(now.getTime() - leaseMs) } }],
      },
      data: { learningClaimedAt: now },
    });
    return res.count === 1;
  }

  async markLearningApplied(id: string, at: Date) {
    await this.db.mockTest.update({ where: { id }, data: { learningAppliedAt: at } });
  }

  async listPendingLearning(now: Date, leaseMs: number, limit: number, userId?: string) {
    const rows = await this.db.mockTest.findMany({
      where: {
        status: 'SUBMITTED',
        learningAppliedAt: null,
        OR: [{ learningClaimedAt: null }, { learningClaimedAt: { lt: new Date(now.getTime() - leaseMs) } }],
        ...(userId ? { userId } : {}),
      },
      orderBy: { submittedAt: 'asc' },
      take: limit,
    });
    return rows.map(toRecord);
  }
}
