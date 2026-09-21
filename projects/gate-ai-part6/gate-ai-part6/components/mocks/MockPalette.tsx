'use client';

import type { ClientAnswerState, MockQuestionDTO, SectionSummary } from '@/server/domains/tests/mock.types';

/** Palette states. Colour is never the only signal: shape/border style and the aria-label carry it too. */
type Status = 'answered' | 'answeredMarked' | 'marked' | 'notAnswered' | 'notVisited';

export function statusOf(a: ClientAnswerState | undefined): Status {
  if (!a) return 'notVisited';
  const answered = a.selected !== null;
  if (answered && a.markedForReview) return 'answeredMarked';
  if (answered) return 'answered';
  if (a.markedForReview) return 'marked';
  return a.visited ? 'notAnswered' : 'notVisited';
}

const LABEL: Record<Status, string> = {
  answered: 'Answered',
  answeredMarked: 'Answered and marked for review',
  marked: 'Marked for review',
  notAnswered: 'Not answered',
  notVisited: 'Not visited',
};

const SKIN: Record<Status, string> = {
  answered: 'bg-[#0E8074] text-white',
  answeredMarked: 'bg-[#0E8074] text-white',
  marked: 'bg-white border-2 border-[#D98E2B] text-[#111111]',
  notAnswered: 'bg-white border border-dashed border-[#77736D] text-[#111111]',
  notVisited: 'bg-[#ECE9E3] text-[#77736D]',
};

interface Props {
  questions: MockQuestionDTO[];
  answers: Record<string, ClientAnswerState>;
  sections: SectionSummary[];
  index: number;
  onGo: (i: number) => void;
}

export function MockPalette({ questions, answers, sections, index, onGo }: Props) {
  const counts: Record<Status, number> = { answered: 0, answeredMarked: 0, marked: 0, notAnswered: 0, notVisited: 0 };
  for (const q of questions) counts[statusOf(answers[q.id])]++;

  return (
    <div className="flex flex-col gap-6">
      {sections.map((s) => (
        <section key={s.key} aria-label={s.label}>
          <p className="mb-3 text-sm font-semibold text-[#111111]">
            {s.label} <span className="font-normal text-[#77736D]">· {s.count} questions</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {questions
              .filter((q) => q.section === s.key)
              .map((q) => {
                const st = statusOf(answers[q.id]);
                const i = q.position - 1;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onGo(i)}
                    aria-label={`Question ${q.position}, ${LABEL[st]}`}
                    aria-current={i === index ? 'true' : undefined}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8F6F2] ${SKIN[st]} ${
                      i === index ? 'ring-2 ring-[#111111] ring-offset-2 ring-offset-[#F8F6F2]' : ''
                    }`}
                  >
                    {q.position}
                    {st === 'answeredMarked' && (
                      <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-[#D98E2B]" />
                    )}
                  </button>
                );
              })}
          </div>
        </section>
      ))}

      <ul className="grid grid-cols-1 gap-2 border-t border-[#E3E0DA] pt-4 text-xs text-[#3a3a3a]">
        {(['answered', 'notAnswered', 'notVisited', 'marked', 'answeredMarked'] as Status[]).map((st) => (
          <li key={st} className="flex items-center gap-2">
            <span aria-hidden className={`relative h-5 w-5 rounded-full ${SKIN[st]}`}>
              {st === 'answeredMarked' && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-[#D98E2B]" />
              )}
            </span>
            <span className="flex-1">{LABEL[st]}</span>
            <span className="font-semibold text-[#111111]">{counts[st]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
