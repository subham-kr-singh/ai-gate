"use client";

import { OptionList } from "./OptionList";
import { NATInput } from "./NATInput";

export interface QuestionCardData {
  id: string;
  type: "MCQ" | "MSQ" | "NAT";
  statement: string;
  options?: { id: string; text: string }[] | null;
  marks: number;
}

export function QuestionCard({
  question,
  index,
  total,
  selected,
  onChange,
  onToggleMark,
  marked,
  hideMeta = false,
  readOnly = false,
  reveal,
}: {
  question: QuestionCardData;
  index: number;
  total: number;
  selected: string | string[] | null;
  onChange: (next: string | string[]) => void;
  onToggleMark: () => void;
  marked: boolean;
  /** Drops the "question n of m · marks" line for single-question surfaces. */
  hideMeta?: boolean;
  /** Settled question: inputs stop responding and correct answers are shown. */
  readOnly?: boolean;
  reveal?: string[];
}) {
  return (
    <div className="rounded-card border border-line bg-white p-6">
      {!hideMeta && (
        <div className="flex items-center justify-between text-xs text-slate mb-3">
          <span>
            Question {index + 1} of {total} &middot; {question.type} &middot; {question.marks} mark
            {question.marks !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={onToggleMark}
            className={marked ? "text-amber font-medium" : "text-slate hover:text-ink"}
          >
            {marked ? "Marked for review" : "Mark for review"}
          </button>
        </div>
      )}

      <p className="text-sm text-ink leading-relaxed mb-4 whitespace-pre-wrap">
        {question.statement}
      </p>

      {question.type === "NAT" ? (
        <NATInput
          value={typeof selected === "string" ? selected : null}
          onChange={onChange}
          disabled={readOnly}
        />
      ) : (
        <OptionList
          options={question.options ?? []}
          type={question.type}
          selected={selected}
          onChange={onChange}
          disabled={readOnly}
          reveal={reveal}
        />
      )}
    </div>
  );
}
