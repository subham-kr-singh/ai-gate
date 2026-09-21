/**
 * Part 6 wiring — the ONLY file that knows about Parts 1–3.
 *
 * mock.service.ts talks to narrow ports (mock.ports.ts). This file plugs the real Part 1–3
 * modules into them. The Part 1–5 source was not available when Part 6 was written, so every
 * line marked `ADAPT` is an assumption taken from PROJECT_PLAN.md / the architecture doc.
 * If `tsc` complains here, the fix is local to this file; nothing else in Part 6 changes.
 */
import { db as prisma } from '@/server/db/client';
import { track as trackAnalytics, type AnalyticsEventType } from '@/server/domains/analytics/analytics.service';
import { gradeAnswer } from '@/server/domains/grading/grading.service';
import { recordAttempt } from '@/server/domains/attempts/attempt.service';
import { recordAnswers } from '@/server/domains/mastery/mastery.service';
import { findActiveSyllabusVersion } from '@/server/domains/syllabus/syllabus.repository';

import type { Candidate } from './mock.assembly';
import { slugifySubject } from './mock.blueprint';
import type { MockPorts } from './mock.ports';
import { PrismaMockRepository } from './mock.repository';
import { MockService } from './mock.service';
import { UnauthorizedError, type FullQuestion, type QuestionType } from './mock.types';

const questions: MockPorts['questions'] = {
  async loadCandidates(userId) {
    const [rows, answers] = await Promise.all([
      prisma.question.findMany({
        where: { status: 'APPROVED' },
        select: { id: true, type: true, marks: true, unitId: true, subject: { select: { name: true } } },
      }),
      prisma.answer.findMany({
        where: { userId },
        select: { questionId: true, createdAt: true },
      }),
    ]);
    const lastSeen = new Map(answers.map((s: { questionId: string; createdAt: Date }) => [s.questionId, s.createdAt.getTime()]));
    return rows.map<Candidate>((q: { id: string; type: string; marks: number; unitId: string; subject: { name: string } }) => ({
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
      include: { subject: true, unit: true, topic: true },
    });
    return rows.map<FullQuestion>((q: any) => ({
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

  async currentSyllabusVersionId() {
    const v = await findActiveSyllabusVersion();
    return v?.id ?? 'v1';
  },
};

const grading: MockPorts['grading'] = {
  grade: (q, answer) => {
    const r = gradeAnswer(
      { type: q.type as any, marks: q.marks, correctAnswer: q.correctAnswer },
      answer as any,
      { negativeMarksFraction: q.type === 'MCQ' ? (q.marks === 2 ? 2/3 : 1/3) : 0, allowsPartialMarking: false },
    );
    return { correct: r.correct, marks: r.marks };
  },
};

const learning: MockPorts['learning'] = {
  async recordMockAttempts({ userId, mockId, submittedAt, answers }) {
    await recordAttempt({
      userId,
      testId: mockId,
      totalMarks: answers.reduce((sum, a) => sum + (a.marks > 0 ? a.marks : 0), 0),
      scoredMarks: answers.reduce((sum, a) => sum + a.marks, 0),
      accuracy: answers.length ? answers.filter((a) => a.correct).length / answers.length : 0,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        selectedAnswer: a.selected as any,
        correct: a.correct,
        marks: a.marks,
        timeTakenMs: a.timeTakenMs,
        confidence: a.confidence ?? undefined,
      })),
    });
    await recordAnswers(
      userId,
      answers.map((a) => ({
        answerId: `${mockId}-${a.questionId}`,
        questionId: a.questionId,
        correct: a.correct,
        isPyq: true,
        timeMs: a.timeTakenMs,
        confidence: (a.confidence as 1 | 2 | 3 | 4) ?? null,
        answeredAt: submittedAt,
      })),
    );
  },
};

const analytics: MockPorts['analytics'] = {
  track: (event, payload) => trackAnalytics(prisma, 'system', event as AnalyticsEventType, payload),
};

let instance: MockService | undefined;

export function getMockService(): MockService {
  instance ??= new MockService({
    repo: new PrismaMockRepository(prisma),
    ports: { questions, grading, learning, analytics },
  });
  return instance;
}

import { requireUserId as getSessionUserId } from '@/server/auth/session';

/** Throws UnauthorizedError (→ HTTP 401) when nobody is signed in. */
export async function requireUserId(): Promise<string> {
  try {
    return await getSessionUserId();
  } catch {
    throw new UnauthorizedError();
  }
}
