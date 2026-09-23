'use client';

import { useMemo, useState } from 'react';
import type { ReviewRow } from '@/server/domains/tests/mock.types';
import { formatAnswer, marks } from './format';

/**
 * Question-by-question review. Correct answers and solutions appear here only because the
 * mock is already submitted. Wrong/blank questions get the one-tap mistake tags from Part 3
 * (architecture: mistake classification is user-controlled in V1).
 */

// ADAPT: Part 3's mistakes route (`app/api/mistakes/route.ts` — POST tags). Shape assumed.
const MISTAKE_API = '/api/mistakes';
const TAGS: [string, string][] = [
  ['CONCEPTUAL_GAP', 'Conceptual gap'],
  ['CALCULATION_ERROR', 'Calculation error'],
  ['MISREAD', 'Misread'],
  ['FORMULA_RECALL', 'Formula recall'],
  ['CONFUSED_CONCEPTS', 'Confused concepts'],
  ['CARELESS_ERROR', 'Careless error'],
  ['GUESS', 'Guess'],
  ['TIME_PRESSURE', 'Time pressure'],
];

type Filter = 'ALL' | 'WRONG' | 'UNANSWERED' | 'MARKED' | 'GUESSED' | 'CHANGED';
const FILTERS: [Filter, string][] = [
  ['ALL', 'All'],
  ['WRONG', 'Wrong'],
  ['UNANSWERED', 'Blank'],
  ['MARKED', 'Marked'],
  ['GUESSED', 'Guessed'],
  ['CHANGED', 'Changed answer'],
];

const OUTCOME_LABEL = { CORRECT: 'Correct', WRONG: 'Wrong', UNANSWERED: 'Not answered' } as const;

function matches(r: ReviewRow, f: Filter): boolean {
  switch (f) {
    case 'WRONG': return r.outcome === 'WRONG';
    case 'UNANSWERED': return r.outcome === 'UNANSWERED';
    case 'MARKED': return r.markedForReview;
    case 'GUESSED': return r.guessed;
    case 'CHANGED': return r.changedAnswer;
    default: return true;
  }
}

export function MockReview({ mockId, rows }: { mockId: string; rows: ReviewRow[] }) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const shown = useMemo(() => rows.filter((r) => matches(r, filter)), [rows, filter]);

  return (
    <section aria-labelledby="review-h" className="flex flex-col gap-4">
      <h2 id="review-h" className="text-lg font-semibold text-ink">
        Question review
      </h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter questions">
        {FILTERS.map(([key, label]) => {
          const n = rows.filter((r) => matches(r, key)).length;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`h-9 rounded-full px-4 text-sm ${filter === key ? 'bg-ink text-white' : 'bg-control text-ink-soft'}`}
            >
              {label} <span className="opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[20px] border border-line p-5 text-sm text-slate">Nothing matches this filter.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((r) => (
            <ReviewItem key={r.questionId} mockId={mockId} row={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewItem({ mockId, row: r }: { mockId: string; row: ReviewRow }) {
  const [tag, setTag] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const correctKey = Array.isArray(r.correctAnswer) ? (r.correctAnswer as string[]) : [String(r.correctAnswer)];
  const mine = Array.isArray(r.finalAnswer) ? r.finalAnswer : r.finalAnswer === null ? [] : [r.finalAnswer];

  async function choose(t: string) {
    setState('saving');
    try {
      const res = await fetch(MISTAKE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'MOCK', sourceId: mockId, questionId: r.questionId, type: t }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setTag(t);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  const tone = r.outcome === 'CORRECT' ? 'text-teal' : r.outcome === 'WRONG' ? 'text-amber' : 'text-slate';

  return (
    <li className="rounded-[20px] border border-line bg-white">
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
          <span className="text-ink">
            <span className="font-semibold">Q{r.position}</span>
            <span className="text-slate"> · {r.subjectName} · {r.unitName}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {r.markedForReview && <span className="text-xs text-slate">Marked</span>}
            {r.guessed && <span className="text-xs text-slate">Guess</span>}
            <span className={`font-medium ${tone}`}>
              {OUTCOME_LABEL[r.outcome]} · {r.marksObtained > 0 ? '+' : ''}{marks(r.marksObtained)}
            </span>
          </span>
        </summary>

        <div className="flex flex-col gap-4 border-t border-line p-4">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{r.statement}</p>

          {r.options && (
            <ul className="flex flex-col gap-2">
              {r.options.map((o) => {
                const isKey = correctKey.includes(o.id);
                const isMine = mine.includes(o.id);
                return (
                  <li key={o.id} className={`flex items-start gap-3 rounded-[20px] border p-3 text-sm ${isKey ? 'border-teal' : isMine ? 'border-amber' : 'border-line'}`}>
                    <span className="font-semibold text-ink">{o.id}</span>
                    <span className="flex-1 whitespace-pre-wrap text-ink">{o.text}</span>
                    <span className="shrink-0 text-xs text-slate">
                      {isKey && 'Correct answer'}
                      {isKey && isMine && ' · '}
                      {isMine && 'Your answer'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {!r.options && (
            <p className="text-sm text-body-muted">
              Correct answer: <span className="font-medium text-ink">{formatAnswer(r.correctAnswer)}</span>
              {' · '}Yours: <span className="font-medium text-ink">{formatAnswer(r.finalAnswer)}</span>
            </p>
          )}

          {r.changedAnswer && (
            <p className="text-sm text-body-muted">
              You first answered <span className="font-medium text-ink">{formatAnswer(r.firstAnswer)}</span> and changed it to{' '}
              <span className="font-medium text-ink">{formatAnswer(r.finalAnswer)}</span>.
            </p>
          )}
          <p className="text-xs text-slate">
            {r.spentSec}s spent{r.year ? ` · GATE ${r.year}` : ''}{r.wasSeenBefore ? ' · seen before' : ' · new to you'}
          </p>

          {r.solution && (
            <div className="rounded-[20px] bg-surface p-4">
              <p className="mb-1 text-xs font-semibold text-slate">Solution</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{r.solution}</p>
            </div>
          )}

          {r.outcome !== 'CORRECT' && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate">Why did this go wrong?</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Mistake type">
                {TAGS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={tag === key}
                    disabled={state === 'saving'}
                    onClick={() => void choose(key)}
                    className={`h-8 rounded-full px-3 text-xs ${tag === key ? 'bg-ink text-white' : 'bg-control text-ink-soft'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {state === 'error' && (
                <p role="alert" className="mt-2 text-xs text-amber">Could not save the tag. Try again.</p>
              )}
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
