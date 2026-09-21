import type { QuestionType, SectionKey } from './mock.types';

/**
 * A blueprint is the paper structure for one exam year (architecture §66:
 * "reproduce the applicable GATE exam structure for the target year").
 * It is DATA, not logic: when the official pattern changes, add a new blueprint
 * — never edit an old one that historical mocks point to.
 *
 * GATE 2027 CS/IT (65 questions · 100 marks · 3 h):
 *   General Aptitude          10 Q · 15 marks  (5 × 1-mark, 5 × 2-mark)
 *   Engineering Mathematics   ┐
 *   Core Computer Science     ┘ 55 Q · 85 marks (25 × 1-mark, 30 × 2-mark)
 *                               of which Engineering Mathematics = 13, core CS = 72
 *   Negative marking: MCQ only (1/3 for a 1-mark, 2/3 for a 2-mark). No negative marking
 *   and no partial marks for MSQ; none for NAT.
 * Verified against published GATE 2027 pattern summaries; re-check against the official
 * IIT Madras notification/mock template before relying on it for your final mocks.
 *
 * The per-subject marks below are STARTING WEIGHTS that add up to the official
 * sections (13 for Engineering Mathematics, 72 for the nine core subjects). The official
 * split per subject varies every year, so tune them against the last few papers.
 * Part 5's marks-weighted priority should read the same numbers — one source of truth.
 */

export interface SectionSpec {
  key: SectionKey;
  label: string;
  oneMark: number;
  twoMark: number;
  /** Target marks per subject, keyed by subject slug (see slugifySubject). */
  subjectMarks: Record<string, number>;
  /** Soft target share of each question type inside this section (need not be exact). */
  typeMix: Partial<Record<QuestionType, number>>;
}

export interface MockBlueprint {
  key: string;
  title: string;
  examYear: number;
  durationSec: number;
  sections: SectionSpec[];
  /** Time budget per mark: durationSec / totalMarks (108 s for GATE). Used for "time lost". */
  expectedSecPerMark: number;
  /** Display-only. Grading is Part 2's `grading.service` + `marking-scheme`. Keep in sync. */
  marking: { mcqPenaltyFraction: number; msqPartial: boolean; natNegative: boolean };
  assemblyVersion: string;
}

/** "Discrete & Engineering Mathematics" → "discrete-engineering-mathematics" */
export function slugifySubject(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const GATE_2027_CS: MockBlueprint = {
  key: 'gate-2027-cs',
  title: 'GATE 2027 · Computer Science full mock',
  examYear: 2027,
  durationSec: 180 * 60,
  expectedSecPerMark: (180 * 60) / 100,
  assemblyVersion: 'v1',
  marking: { mcqPenaltyFraction: 1 / 3, msqPartial: false, natNegative: false },
  sections: [
    {
      key: 'GA',
      label: 'General Aptitude',
      oneMark: 5,
      twoMark: 5,
      subjectMarks: { 'general-aptitude': 15 },
      typeMix: { MCQ: 1 },
    },
    {
      key: 'CORE',
      label: 'Computer Science',
      oneMark: 25,
      twoMark: 30,
      subjectMarks: {
        'discrete-engineering-mathematics': 13,
        'theory-of-computation': 7,
        'digital-logic': 5,
        'computer-organization-architecture': 8,
        'programming-data-structures': 11,
        algorithms: 9,
        'compiler-design': 6,
        'operating-systems': 9,
        databases: 9,
        'computer-networks': 8,
      },
      typeMix: { MCQ: 0.6, MSQ: 0.15, NAT: 0.25 },
    },
  ],
};

export const BLUEPRINTS: Record<string, MockBlueprint> = {
  [GATE_2027_CS.key]: GATE_2027_CS,
};

export const DEFAULT_BLUEPRINT_KEY = GATE_2027_CS.key;

/** Personal target from the dashboard ("Mocks completed 2 / 8"). Change in one place. */
export const RECOMMENDED_MOCK_COUNT = 8;

export function blueprintTotals(bp: MockBlueprint) {
  const totalQuestions = bp.sections.reduce((n, s) => n + s.oneMark + s.twoMark, 0);
  const totalMarks = bp.sections.reduce((n, s) => n + s.oneMark + 2 * s.twoMark, 0);
  return { totalQuestions, totalMarks };
}

/** 1/3 → "1/3", 2/3 → "2/3", 2 → "2". */
export function formatMarks(x: number): string {
  const abs = Math.abs(x);
  const thirds = Math.round(abs * 3);
  if (Math.abs(abs * 3 - thirds) < 1e-6 && thirds % 3 !== 0) return `${thirds}/3`;
  return String(Math.round(abs * 100) / 100);
}

/** The line shown above every question, in the spirit of the real GATE interface. */
export function markingNote(bp: MockBlueprint, type: QuestionType, marks: number): string {
  const award = `+${formatMarks(marks)} for a correct answer`;
  if (type === 'MCQ') {
    return `${award} · −${formatMarks(marks * bp.marking.mcqPenaltyFraction)} for a wrong answer`;
  }
  if (type === 'MSQ') {
    return `${award} · no negative marking · no partial marks`;
  }
  return `${award} · no negative marking`;
}

export function markingRules(bp: MockBlueprint): string[] {
  return [
    `Wrong MCQ: −${formatMarks(bp.marking.mcqPenaltyFraction)} of the question's marks (1 mark → −1/3, 2 marks → −2/3).`,
    'MSQ: all correct options and no others earn the marks. No partial marks, no negative marking.',
    'NAT: type the value. No negative marking.',
    'Leaving a question blank never costs marks.',
  ];
}
