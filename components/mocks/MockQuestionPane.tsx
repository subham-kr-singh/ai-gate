'use client';

import { Eraser, Flag, HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ClientAnswerState, MockQuestionDTO, RawAnswer } from '@/server/domains/tests/mock.types';

const TYPE_LABEL = { MCQ: 'Multiple choice', MSQ: 'Multiple select', NAT: 'Numerical answer' } as const;

interface Props {
  question: MockQuestionDTO;
  sectionLabel: string;
  answer: ClientAnswerState;
  disabled: boolean;
  onSelect: (value: RawAnswer, debounce?: boolean) => void;
  onClear: () => void;
  onToggleMark: () => void;
  onToggleGuess: () => void;
  /** Plug KaTeX / markdown rendering in here; defaults to preformatted plain text. */
  renderContent?: (text: string) => ReactNode;
}

const plain = (t: string) => <span className="whitespace-pre-wrap">{t}</span>;

export function MockQuestionPane({
  question: q,
  sectionLabel,
  answer,
  disabled,
  onSelect,
  onClear,
  onToggleMark,
  onToggleGuess,
  renderContent = plain,
}: Props) {
  const selectedList = Array.isArray(answer.selected) ? answer.selected : [];

  return (
    <article aria-labelledby={`q-${q.id}-h`} className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h2 id={`q-${q.id}-h`} className="text-sm font-semibold text-[#111111]">
          Question {q.position}
          <span className="font-normal text-[#77736D]">
            {' '}
            · {sectionLabel} · {q.marks} {q.marks === 1 ? 'mark' : 'marks'} · {TYPE_LABEL[q.type]}
          </span>
        </h2>
        <p className="mt-1 text-xs text-[#77736D]">{q.markingNote}</p>
      </header>

      <div className="text-[15px] leading-relaxed text-[#111111]">{renderContent(q.statement)}</div>

      {q.type === 'MCQ' && q.options && (
        <fieldset disabled={disabled} className="flex flex-col gap-3">
          <legend className="sr-only">Choose one answer</legend>
          {q.options.map((o) => {
            const checked = answer.selected === o.id;
            return (
              <label
                key={o.id}
                className={`flex cursor-pointer items-start gap-3 rounded-[20px] border bg-white p-4 focus-within:ring-2 focus-within:ring-[#111111] ${
                  checked ? 'border-[#111111]' : 'border-[#E3E0DA]'
                }`}
              >
                <input type="radio" name={`q-${q.id}`} className="sr-only" checked={checked} onChange={() => onSelect(o.id)} />
                <span
                  aria-hidden
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    checked ? 'bg-[#111111] text-white' : 'bg-[#ECE9E3] text-[#111111]'
                  }`}
                >
                  {o.id}
                </span>
                <span className="pt-1 text-[15px] leading-relaxed">{renderContent(o.text)}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {q.type === 'MSQ' && q.options && (
        <fieldset disabled={disabled} className="flex flex-col gap-3">
          <legend className="mb-1 text-xs text-[#77736D]">Select all that apply</legend>
          {q.options.map((o) => {
            const checked = selectedList.includes(o.id);
            return (
              <label
                key={o.id}
                className={`flex cursor-pointer items-start gap-3 rounded-[20px] border bg-white p-4 focus-within:ring-2 focus-within:ring-[#111111] ${
                  checked ? 'border-[#111111]' : 'border-[#E3E0DA]'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() =>
                    onSelect(checked ? selectedList.filter((x) => x !== o.id) : [...selectedList, o.id].sort())
                  }
                />
                <span
                  aria-hidden
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
                    checked ? 'bg-[#111111] text-white' : 'bg-[#ECE9E3] text-[#111111]'
                  }`}
                >
                  {o.id}
                </span>
                <span className="pt-1 text-[15px] leading-relaxed">{renderContent(o.text)}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {q.type === 'NAT' && (
        <label className="block">
          <span className="text-sm text-[#77736D]">Your answer</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={typeof answer.selected === 'string' ? answer.selected : ''}
            onChange={(e) => {
              const v = e.target.value;
              if (/^-?\d*\.?\d*$/.test(v)) onSelect(v, true);
            }}
            className="mt-2 h-12 w-full rounded-full bg-[#ECE9E3] px-5 text-lg text-[#111111] outline-none placeholder:text-[#9B968E] focus-visible:ring-2 focus-visible:ring-[#111111] sm:w-64"
            placeholder="Type a number"
          />
        </label>
      )}

      <div className="flex flex-wrap gap-2 border-t border-[#E3E0DA] pt-4">
        <button
          type="button"
          onClick={onToggleMark}
          aria-pressed={answer.markedForReview}
          disabled={disabled}
          className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm ${
            answer.markedForReview ? 'bg-[#D98E2B] font-medium text-[#111111]' : 'bg-[#ECE9E3] text-[#222222]'
          }`}
        >
          <Flag size={14} aria-hidden />
          {answer.markedForReview ? 'Marked for review' : 'Mark for review'}
        </button>
        <button
          type="button"
          onClick={onToggleGuess}
          aria-pressed={answer.guessed}
          disabled={disabled}
          title="Optional. Feeds the guessing analysis on your result page."
          className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm ${
            answer.guessed ? 'bg-[#111111] font-medium text-white' : 'bg-[#ECE9E3] text-[#222222]'
          }`}
        >
          <HelpCircle size={14} aria-hidden />
          {answer.guessed ? 'Flagged as a guess' : 'I am guessing'}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled || answer.selected === null}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-[#ECE9E3] px-4 text-sm text-[#222222] disabled:opacity-50"
        >
          <Eraser size={14} aria-hidden />
          Clear response
        </button>
      </div>
    </article>
  );
}
