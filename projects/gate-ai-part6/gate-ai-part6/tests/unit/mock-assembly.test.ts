import { describe, expect, it } from 'vitest';
import { GATE_2027_CS, blueprintTotals, formatMarks, markingNote, slugifySubject } from '@/server/domains/tests/mock.blueprint';
import { allocate, assemblePaper, createRng } from '@/server/domains/tests/mock.assembly';
import { InsufficientQuestionBankError } from '@/server/domains/tests/mock.types';
import { SUBJECTS, buildBank } from '../helpers/mock-memory';

describe('blueprint', () => {
  it('GATE 2027 CS is 65 questions / 100 marks / 3 hours', () => {
    expect(blueprintTotals(GATE_2027_CS)).toEqual({ totalQuestions: 65, totalMarks: 100 });
    expect(GATE_2027_CS.durationSec).toBe(10_800);
    const [ga, core] = GATE_2027_CS.sections;
    expect(Object.values(ga!.subjectMarks).reduce((a, b) => a + b, 0)).toBe(15);
    expect(Object.values(core!.subjectMarks).reduce((a, b) => a + b, 0)).toBe(85);
    // Engineering Mathematics 13 + core CS 72
    expect(core!.subjectMarks['discrete-engineering-mathematics']).toBe(13);
    expect(85 - 13).toBe(72);
  });

  it('every syllabus subject slug used by the blueprint matches slugifySubject(name)', () => {
    const slugs = Object.keys(SUBJECTS);
    for (const [name, slug] of Object.entries(SUBJECTS).map(([s, n]) => [n, s])) {
      expect(slugifySubject(name!)).toBe(slug);
    }
    for (const s of GATE_2027_CS.sections) for (const k of Object.keys(s.subjectMarks)) expect(slugs).toContain(k);
  });

  it('formats negative marks as GATE prints them', () => {
    expect(formatMarks(1 / 3)).toBe('1/3');
    expect(formatMarks(2 / 3)).toBe('2/3');
    expect(formatMarks(2)).toBe('2');
    expect(markingNote(GATE_2027_CS, 'MCQ', 2)).toContain('−2/3');
    expect(markingNote(GATE_2027_CS, 'NAT', 1)).toContain('no negative marking');
  });
});

describe('allocate', () => {
  const rng = createRng('t');
  it('sums to the total and follows weights', () => {
    const out = allocate(30, { a: 60, b: 30, c: 10 }, { a: 99, b: 99, c: 99 }, rng);
    expect(out).toEqual({ a: 18, b: 9, c: 3 });
  });
  it('redistributes what a capped subject cannot supply', () => {
    const out = allocate(10, { a: 50, b: 50 }, { a: 2, b: 99 }, rng);
    expect(out.a).toBe(2);
    expect(out.b).toBe(8);
  });
  it('gives up gracefully when capacity is insufficient', () => {
    const out = allocate(10, { a: 1, b: 1 }, { a: 2, b: 3 }, rng);
    expect(out.a! + out.b!).toBe(5);
  });
});

describe('assemblePaper', () => {
  const { candidates } = buildBank();

  it('builds a 65-question, 100-mark paper in GATE order (GA first, 1-mark block then 2-mark block)', () => {
    const p = assemblePaper(GATE_2027_CS, candidates, { seed: 's1' });
    expect(p.items).toHaveLength(65);
    expect(p.items.reduce((n, i) => n + i.marks, 0)).toBe(100);
    expect(p.items.map((i) => i.position)).toEqual(Array.from({ length: 65 }, (_, i) => i + 1));
    expect(new Set(p.items.map((i) => i.questionId)).size).toBe(65);

    const ga = p.items.filter((i) => i.section === 'GA');
    const core = p.items.filter((i) => i.section === 'CORE');
    expect(ga).toHaveLength(10);
    expect(core).toHaveLength(55);
    expect(p.items.slice(0, 10).every((i) => i.section === 'GA')).toBe(true);
    expect(ga.filter((i) => i.marks === 1)).toHaveLength(5);
    expect(core.filter((i) => i.marks === 1)).toHaveLength(25);
    expect(core.filter((i) => i.marks === 2)).toHaveLength(30);
    // 1-mark block precedes 2-mark block inside each section
    const firstTwo = (xs: typeof ga) => xs.findIndex((i) => i.marks === 2);
    expect(core.slice(0, firstTwo(core)).every((i) => i.marks === 1)).toBe(true);
    expect(core.slice(firstTwo(core)).every((i) => i.marks === 2)).toBe(true);
  });

  it('is deterministic for a seed and different across seeds', () => {
    const a = assemblePaper(GATE_2027_CS, candidates, { seed: 'same' });
    const b = assemblePaper(GATE_2027_CS, candidates, { seed: 'same' });
    const c = assemblePaper(GATE_2027_CS, candidates, { seed: 'other' });
    expect(a.items.map((i) => i.questionId)).toEqual(b.items.map((i) => i.questionId));
    expect(a.items.map((i) => i.questionId)).not.toEqual(c.items.map((i) => i.questionId));
  });

  it('subject marks track the blueprint when jitter is off', () => {
    const p = assemblePaper(GATE_2027_CS, candidates, { seed: 'x', weightJitter: 0 });
    const marksBy = new Map<string, number>();
    for (const i of p.items) marksBy.set(i.subjectKey, (marksBy.get(i.subjectKey) ?? 0) + i.marks);
    const core = GATE_2027_CS.sections[1]!.subjectMarks;
    for (const [k, target] of Object.entries(core)) {
      expect(Math.abs((marksBy.get(k) ?? 0) - target)).toBeLessThanOrEqual(3);
    }
  });

  it('prefers questions the student has never seen', () => {
    const seen = new Set(candidates.filter((_, i) => i % 2 === 0).map((c) => c.id));
    const pool = candidates.map((c) => ({ ...c, seenBefore: seen.has(c.id) }));
    const p = assemblePaper(GATE_2027_CS, pool, { seed: 'fresh' });
    expect(p.freshCount).toBe(65); // half the bank is unseen — plenty to fill the paper
    const q = assemblePaper(GATE_2027_CS, pool, { seed: 'fresh', preferUnseen: false });
    expect(q.freshCount).toBeLessThan(65);
  });

  it('falls back to seen questions (oldest first) when unseen ones run out', () => {
    const pool = candidates.map((c, i) => ({ ...c, seenBefore: true, lastSeenAtMs: i }));
    const p = assemblePaper(GATE_2027_CS, pool, { seed: 'stale' });
    expect(p.items).toHaveLength(65);
    expect(p.freshCount).toBe(0);
  });

  it('spreads a subject across its units', () => {
    const p = assemblePaper(GATE_2027_CS, candidates, { seed: 'units', weightJitter: 0 });
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const os = p.items.filter((i) => i.subjectKey === 'operating-systems').map((i) => byId.get(i.questionId)!.unitId);
    expect(new Set(os).size).toBeGreaterThan(1);
  });

  it('hits the soft MCQ/MSQ/NAT mix inside the core section', () => {
    const p = assemblePaper(GATE_2027_CS, candidates, { seed: 'mix' });
    const core = p.items.filter((i) => i.section === 'CORE');
    const share = (t: string) => core.filter((i) => i.type === t).length / core.length;
    expect(share('MCQ')).toBeGreaterThan(0.45);
    expect(share('NAT')).toBeGreaterThan(0.15);
    expect(share('MSQ')).toBeGreaterThan(0.05);
  });

  it('explains exactly what the bank is missing', () => {
    const thin = candidates.filter((c) => !(c.subjectKey === 'general-aptitude' && c.marks === 2));
    try {
      assemblePaper(GATE_2027_CS, thin, { seed: 'thin' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(InsufficientQuestionBankError);
      expect((e as InsufficientQuestionBankError).shortfalls).toEqual([
        { section: 'GA', marks: 2, needed: 5, available: 0 },
      ]);
    }
  });

  it('ignores questions from subjects outside the blueprint', () => {
    const extra = [...candidates, { id: 'x1', subjectKey: 'quantum-basketry', unitId: 'u', marks: 1, type: 'MCQ' as const, seenBefore: false, lastSeenAtMs: null }];
    const p = assemblePaper(GATE_2027_CS, extra, { seed: 'extra' });
    expect(p.items.find((i) => i.questionId === 'x1')).toBeUndefined();
  });
});
