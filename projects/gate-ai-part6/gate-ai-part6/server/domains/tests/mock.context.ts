/**
 * Part 6 wiring — the ONLY file that knows about Parts 1–3.
 *
 * mock.service.ts talks to narrow ports (mock.ports.ts). This file plugs the real Part 1–3
 * modules into them. The Part 1–5 source was not available when Part 6 was written, so every
 * line marked `ADAPT` is an assumption taken from PROJECT_PLAN.md / the architecture doc.
 * If `tsc` complains here, the fix is local to this file; nothing else in Part 6 changes.
 */
import { getSessionUser } from '@/server/auth/session'; // ADAPT: Part 1 session helper → { id } | null
import { prisma } from '@/server/db/client'; // ADAPT: Part 1 Prisma singleton (named export)
import { analyticsService } from '@/server/domains/analytics/analytics.service'; // ADAPT: Part 3 event log
import { gradeAnswer } from '@/server/domains/grading/grading.service'; // ADAPT: Part 2 pure grader
import { attemptService } from '@/server/domains/attempts/attempt.service'; // ADAPT: Part 2 append-only attempts
import { masteryService } from '@/server/domains/mastery/mastery.service'; // ADAPT: Part 3 EMA update
import { getCurrentSyllabusVersionId } from '@/server/domains/syllabus/syllabus.service'; // ADAPT: Part 1

import type { Candidate } from './mock.assembly';
import { slugifySubject } from './mock.blueprint';
import type { MockPorts } from './mock.ports';
import { PrismaMockRepository } from './mock.repository';
import { MockService } from './mock.service';
import { UnauthorizedError, type FullQuestion, type QuestionType } from './mock.types';

const questions: MockPorts['questions'] = {
  async loadCandidates(userId) {
    // ADAPT: field/relation names follow architecture §18 (Question has subject/unit/topic).
    const [rows, seen] = await Promise.all([
      prisma.question.findMany({
        where: { status: 'APPROVED' }, // only trusted answer keys become learning evidence
        select: { id: true, type: true, marks: true, unitId: true, subject: { select: { name: true } } },
      }),
      prisma.attempt.groupBy({
        by: ['questionId'],
        where: { userId },
        _max: { createdAt: true },
      }),
    ]);
    const lastSeen = new Map(seen.map((s) => [s.questionId, s._max.createdAt?.getTime() ?? null]));
    return rows.map<Candidate>((q) => ({
      id: q.id,
      subjectKey: slugifySubject(q.subject.name),
      unitId: q.unitId,
      marks: q.marks,
      type: q.type as QuestionType,
      seenBefore: lastSeen.has(q.id),
      lastSeenAtMs: lastSeen.get(q.id) ?? null,
    }));
  },

  async loadFull(ids) {
    const rows = await prisma.question.findMany({
      where: { id: { in: ids } },
      include: { subject: true, unit: true, topic: true }, // ADAPT relation names
    });
    return rows.map<FullQuestion>((q) => ({
      id: q.id,
      type: q.type as QuestionType,
      marks: q.marks,
      section: slugifySubject(q.subject.name) === 'general-aptitude' ? 'GA' : 'CORE',
      statement: q.statement,
      options: (q.options as FullQuestion['options']) ?? null,
      subjectId: q.subjectId,
      subjectName: q.subject.name,
      unitId: q.unitId,
      unitName: q.unit.name,
      topicId: q.topicId ?? null,
      topicName: q.topic?.name ?? null,
      year: q.year ?? null,
      source: q.source ?? null,
      correctAnswer: q.correctAnswer,
      solution: q.solution ?? null,
    }));
  },

  currentSyllabusVersionId: () => getCurrentSyllabusVersionId(),
};

const grading: MockPorts['grading'] = {
  // ADAPT: Part 2's grading.service is a pure (question, answer) → { correct, marks } function
  // that reads the per-exam-year marking scheme. Never re-implement GATE marking here.
  grade: (q, answer, { examYear }) => {
    const r = gradeAnswer(
      { type: q.type, marks: q.marks, correctAnswer: q.correctAnswer },
      answer,
      { examYear },
    );
    return { correct: r.correct, marks: r.marks };
  },
};

const learning: MockPorts['learning'] = {
  // CONTRACT: idempotent per mockId. Part 6 already guards with a lease, but the sink should
  // also upsert on (source = MOCK, sourceId = mockId, questionId) so a crash between
  // "recorded" and "marked applied" can never double-count mastery.
  async recordMockAttempts({ userId, mockId, submittedAt, answers }) {
    await attemptService.recordBatch({
      // ADAPT: whatever Part 2 exposes for append-only batch writes
      userId,
      source: 'MOCK',
      sourceId: mockId,
      occurredAt: submittedAt,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        selectedAnswer: a.selected,
        correct: a.correct,
        marks: a.marks,
        timeTakenMs: a.timeTakenMs,
        confidence: a.confidence,
      })),
    });
    await masteryService.applyAttempts({ userId, source: 'MOCK', sourceId: mockId }); // ADAPT
  },
};

const analytics: MockPorts['analytics'] = {
  track: (event, payload) => analyticsService.track(event, payload), // ADAPT
};

let instance: MockService | undefined;

export function getMockService(): MockService {
  instance ??= new MockService({
    repo: new PrismaMockRepository(prisma),
    ports: { questions, grading, learning, analytics },
  });
  return instance;
}

/** Throws UnauthorizedError (→ HTTP 401) when nobody is signed in. */
export async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}
