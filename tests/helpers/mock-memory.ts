import type { Candidate } from '@/server/domains/tests/mock.assembly';
import type {
  ApplyResult,
  FinalizeData,
  LearningAnswer,
  MockPorts,
  MockRecord,
  MockRepository,
  NewMock,
  PaperItemRecord,
} from '@/server/domains/tests/mock.ports';
import { emptyState, reduceEvent, type AnswerStateRecord } from '@/server/domains/tests/mock.reducer';
import type { FullQuestion, MockEventInput, QuestionType } from '@/server/domains/tests/mock.types';

/** In-memory MockRepository with the same guarantees as the Prisma one (idempotent, seq-guarded). */
export class MemoryMockRepo implements MockRepository {
  mocks = new Map<string, MockRecord>();
  items = new Map<string, PaperItemRecord[]>();
  states = new Map<string, Map<string, AnswerStateRecord>>();
  seqs = new Map<string, Set<number>>();
  claims = new Map<string, Date | null>();
  private n = 0;
  constructor(private clock: () => number) {}

  async create(d: NewMock, items: PaperItemRecord[]): Promise<MockRecord> {
    const id = `m${++this.n}`;
    const rec: MockRecord = {
      id, ...d, status: 'READY', startedAt: null, deadlineAt: null, submittedAt: null, submitReason: null,
      lastSeq: 0, score: null, result: null, learningAppliedAt: null, createdAt: new Date(this.clock()),
    };
    this.mocks.set(id, rec);
    this.items.set(id, items);
    this.states.set(id, new Map());
    this.seqs.set(id, new Set());
    return { ...rec };
  }
  async get(userId: string, id: string) {
    const m = this.mocks.get(id);
    return m && m.userId === userId ? { ...m } : null;
  }
  async getById(id: string) {
    const m = this.mocks.get(id);
    return m ? { ...m } : null;
  }
  async listForUser(userId: string, limit: number) {
    return [...this.mocks.values()]
      .filter((m) => m.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((m) => ({ ...m }));
  }
  async findInProgress(userId: string) {
    const m = [...this.mocks.values()].find((x) => x.userId === userId && x.status === 'IN_PROGRESS');
    return m ? { ...m } : null;
  }
  async findExpired(before: Date, userId?: string) {
    return [...this.mocks.values()]
      .filter((m) => m.status === 'IN_PROGRESS' && m.deadlineAt && m.deadlineAt < before && (!userId || m.userId === userId))
      .map((m) => ({ ...m }));
  }
  async getItems(id: string) {
    return [...(this.items.get(id) ?? [])].sort((a, b) => a.position - b.position);
  }
  async getStates(id: string) {
    return [...(this.states.get(id)?.values() ?? [])].map((s) => ({ ...s }));
  }
  async start(id: string, startedAt: Date, deadlineAt: Date) {
    const m = this.mocks.get(id);
    if (!m || m.status !== 'READY') return false;
    Object.assign(m, { status: 'IN_PROGRESS', startedAt, deadlineAt });
    return true;
  }
  async applyEvents(id: string, events: MockEventInput[]): Promise<ApplyResult> {
    const m = this.mocks.get(id)!;
    if (m.status !== 'IN_PROGRESS') {
      return { applied: 0, duplicates: events.length, unknownQuestion: 0, lastSeq: m.lastSeq, status: m.status };
    }
    const known = new Set(this.items.get(id)!.map((i) => i.questionId));
    const seen = this.seqs.get(id)!;
    const st = this.states.get(id)!;
    let applied = 0, duplicates = 0, unknownQuestion = 0;
    for (const ev of [...events].sort((a, b) => a.seq - b.seq)) {
      if (!known.has(ev.questionId)) { unknownQuestion++; continue; }
      if (seen.has(ev.seq)) { duplicates++; continue; }
      seen.add(ev.seq);
      const cur = st.get(ev.questionId) ?? emptyState(ev.questionId);
      st.set(ev.questionId, reduceEvent(cur, ev).state);
      m.lastSeq = Math.max(m.lastSeq, ev.seq);
      applied++;
    }
    return { applied, duplicates, unknownQuestion, lastSeq: m.lastSeq, status: m.status };
  }
  async finalize(id: string, build: (s: AnswerStateRecord[]) => FinalizeData) {
    const m = this.mocks.get(id)!;
    if (m.status !== 'IN_PROGRESS') return false;
    const d = build([...(this.states.get(id)?.values() ?? [])]);
    Object.assign(m, { status: 'SUBMITTED', submittedAt: d.submittedAt, submitReason: d.reason, score: d.score, result: d.analytics });
    for (const f of d.firstAnswerFills) {
      const s = this.states.get(id)!.get(f.questionId);
      if (s) s.firstAnswer = f.firstAnswer;
    }
    return true;
  }
  async claimLearning(id: string, now: Date, lease: number) {
    const m = this.mocks.get(id)!;
    if (m.learningAppliedAt) return false;
    const c = this.claims.get(id);
    if (c && now.getTime() - c.getTime() < lease) return false;
    this.claims.set(id, now);
    return true;
  }
  async markLearningApplied(id: string, at: Date) {
    this.mocks.get(id)!.learningAppliedAt = at;
  }
  async listPendingLearning(now: Date, lease: number, limit: number, userId?: string) {
    return [...this.mocks.values()]
      .filter((m) => m.status === 'SUBMITTED' && !m.learningAppliedAt && (!userId || m.userId === userId))
      .filter((m) => { const c = this.claims.get(m.id); return !c || now.getTime() - c.getTime() >= lease; })
      .slice(0, limit)
      .map((m) => ({ ...m }));
  }
}

// ── fixtures ─────────────────────────────────────────────────────────────────

export const SUBJECTS: Record<string, string> = {
  'general-aptitude': 'General Aptitude',
  'discrete-engineering-mathematics': 'Discrete & Engineering Mathematics',
  'theory-of-computation': 'Theory of Computation',
  'digital-logic': 'Digital Logic',
  'computer-organization-architecture': 'Computer Organization & Architecture',
  'programming-data-structures': 'Programming & Data Structures',
  algorithms: 'Algorithms',
  'compiler-design': 'Compiler Design',
  'operating-systems': 'Operating Systems',
  databases: 'Databases',
  'computer-networks': 'Computer Networks',
};

/** A bank big enough for several mocks: per subject, 3 units × (marks 1 ×6, marks 2 ×6). */
export function buildBank(perUnit = 6): { candidates: Candidate[]; full: Map<string, FullQuestion> } {
  const candidates: Candidate[] = [];
  const full = new Map<string, FullQuestion>();
  const types: QuestionType[] = ['MCQ', 'MCQ', 'MCQ', 'MSQ', 'NAT', 'NAT'];
  let n = 0;
  for (const [slug, name] of Object.entries(SUBJECTS)) {
    for (let u = 1; u <= 3; u++) {
      for (const marks of [1, 2]) {
        for (let k = 0; k < perUnit; k++) {
          const id = `q${++n}`;
          const type: QuestionType = slug === 'general-aptitude' ? 'MCQ' : types[k % types.length]!;
          candidates.push({ id, subjectKey: slug, unitId: `${slug}-u${u}`, marks, type, seenBefore: false, lastSeenAtMs: null });
          full.set(id, {
            id, type, marks, section: slug === 'general-aptitude' ? 'GA' : 'CORE',
            statement: `Statement ${id}`,
            options: type === 'NAT' ? null : ['A', 'B', 'C', 'D'].map((o) => ({ id: o, text: `Option ${o}` })),
            subjectId: slug, subjectName: name, unitId: `${slug}-u${u}`, unitName: `Unit ${u}`,
            topicId: `${slug}-u${u}-t1`, topicName: 'Topic 1', year: 2020, source: 'PYQ',
            correctAnswer: type === 'MSQ' ? ['A', 'C'] : type === 'NAT' ? '42' : 'A',
            solution: `Solution ${id}`,
          });
        }
      }
    }
  }
  return { candidates, full };
}

/** GATE-style deterministic grading for tests: MCQ −1/3·marks penalty, MSQ/NAT no penalty. */
export function gradeLikeGate(q: FullQuestion, a: string | string[]) {
  const key = q.correctAnswer;
  const correct = Array.isArray(key)
    ? Array.isArray(a) && a.length === key.length && [...a].sort().join() === [...key].sort().join()
    : String(a).trim() === String(key);
  if (correct) return { correct: true, marks: q.marks };
  return { correct: false, marks: q.type === 'MCQ' ? -(q.marks / 3) : 0 };
}

export function fakePorts(bank = buildBank()) {
  const recorded: { mockId: string; answers: LearningAnswer[] }[] = [];
  const events: string[] = [];
  const state = { failLearning: 0, seenIds: new Set<string>() };
  const ports: MockPorts = {
    questions: {
      loadCandidates: async () => bank.candidates.map((c) => ({ ...c, seenBefore: state.seenIds.has(c.id) })),
      loadFull: async (ids) => ids.map((i) => bank.full.get(i)!).filter(Boolean),
      currentSyllabusVersionId: async () => 'syl-v1',
    },
    grading: { grade: (q, a) => gradeLikeGate(q, a) },
    learning: {
      recordMockAttempts: async (input) => {
        if (state.failLearning > 0) { state.failLearning--; throw new Error('boom'); }
        recorded.push({ mockId: input.mockId, answers: input.answers });
      },
    },
    analytics: { track: (e) => { events.push(e); } },
  };
  return { ports, recorded, events, state, bank };
}
