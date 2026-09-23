"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QuestionCard } from "@/components/test/QuestionCard";

export interface DppQuestionData {
  id: string;
  type: "MCQ" | "MSQ" | "NAT";
  statement: string;
  options: { id: string; text: string }[] | null;
  marks: number;
  solution: string | null;
  year: number | null;
  examYear: number;
}

interface Props {
  dppId: string;
  question: DppQuestionData;
  alreadyAnswered: boolean;
  previousOutcome: { correct: boolean } | null;
  /** Correct option id(s); shown once settled. Null for NAT. */
  correctAnswer: string[] | null;
  /** What the student picked earlier, restored on the recap. */
  initialSelected?: string | string[] | null;
  /** Next unanswered question, or undefined when the set is done. */
  nextHref?: string;
}

/**
 * Answer one DPP question, then reveal the outcome and solution in place.
 *
 * Unlike a timed test there is no draft or revisit: one submit grades it
 * server-side and the result is final, so the UI goes straight to a locked
 * recap. A refresh on an answered question renders the same recap from the
 * stored outcome instead of re-offering the options.
 */
export function DppQuestionCard({
  dppId,
  question,
  alreadyAnswered,
  previousOutcome,
  correctAnswer,
  initialSelected = null,
  nextHref,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | string[] | null>(initialSelected);
  const [outcome, setOutcome] = useState<{ correct: boolean } | null>(previousOutcome);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settled = Boolean(outcome) || alreadyAnswered;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dpp/${dppId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, selected }),
      });
      const body = (await res.json().catch(() => null)) as
        | { correct?: boolean; error?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? "Could not save that answer. Try again.");
        setBusy(false);
        return;
      }
      setOutcome({ correct: Boolean(body?.correct) });
      router.refresh();
    } catch {
      setError("Network problem. Your answer was not saved; try again.");
    }
    setBusy(false);
  }

  const isBlank = selected === null || (Array.isArray(selected) && selected.length === 0);

  return (
    <div className="flex flex-col gap-5">
      <QuestionCard
        question={{
          id: question.id,
          type: question.type,
          statement: question.statement,
          options: question.options,
          marks: question.marks,
        }}
        index={0}
        total={1}
        selected={selected}
        onChange={setSelected}
        onToggleMark={() => {}}
        marked={false}
        hideMeta
        readOnly={settled}
        reveal={settled ? (correctAnswer ?? undefined) : undefined}
      />

      {error && (
        <p role="alert" className="rounded-[20px] bg-butter p-4 text-sm text-ink">
          {error}
        </p>
      )}

      {outcome ? (
        <section aria-live="polite" className="rounded-[20px] border border-line bg-white p-6">
          <p
            className={`text-sm font-semibold ${
              outcome.correct ? "text-teal" : "text-amber"
            }`}
          >
            {outcome.correct ? "Correct" : "Not correct"}
          </p>
          {question.solution ? (
            <div className="mt-3">
              <h2 className="text-sm font-semibold text-ink">Solution</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-body-muted">
                {question.solution}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate">
              No worked solution is stored for this question.
            </p>
          )}
          {alreadyAnswered && (
            <p className="mt-2 text-sm text-slate">
              This question was already answered earlier today.
            </p>
          )}
        </section>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={busy || isBlank}
          className="h-11 rounded-full bg-ink text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Checking…" : "Submit answer"}
        </button>
      )}

      {settled && (
        <div className="flex flex-wrap gap-3">
          {nextHref ? (
            <Link
              href={nextHref as never}
              className="inline-flex h-11 items-center rounded-full bg-ink px-6 text-sm font-medium text-white"
            >
              Next question
            </Link>
          ) : (
            <Link
              href="/practice/dpp"
              className="inline-flex h-11 items-center rounded-full bg-teal px-6 text-sm font-medium text-white"
            >
              Set complete — back to today&apos;s practice
            </Link>
          )}
          <Link
            href="/practice/dpp"
            className="inline-flex h-11 items-center rounded-full border border-line px-6 text-sm text-ink"
          >
            All questions
          </Link>
        </div>
      )}

      <p className="text-xs text-slate-light">
        {question.year ? `GATE ${question.year}` : `Aligned to GATE ${question.examYear}`} ·{" "}
        {question.type}
      </p>
    </div>
  );
}
