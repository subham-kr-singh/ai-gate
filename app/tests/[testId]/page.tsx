"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuestionCard, type QuestionCardData } from "@/components/test/QuestionCard";
import { Palette, type PaletteStatus } from "@/components/test/Palette";
import { Timer } from "@/components/test/Timer";
import { SubmitConfirm } from "@/components/test/SubmitConfirm";
import { Button } from "@/components/ui/Button";

interface TestQuestionRow {
  questionId: string;
  order: number;
  question: QuestionCardData;
}

interface TestDetail {
  id: string;
  title: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "ABANDONED";
  deadlineAt: string | null;
  draftAnswers: Record<
    string,
    { seq: number; selectedAnswer: string | string[] | null; markedForReview?: boolean }
  > | null;
  testQuestions: TestQuestionRow[];
}

export default function TestPage({ params }: { params: { testId: string } }) {
  const router = useRouter();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[] | null>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const seqRef = useRef<Record<string, number>>({});

  useEffect(() => {
    fetch(`/api/tests/${params.testId}`)
      .then((r) => r.json())
      .then((data: TestDetail) => {
        setTest(data);
        const initialAnswers: Record<string, string | string[] | null> = {};
        const initialMarked: Record<string, boolean> = {};
        for (const [qid, entry] of Object.entries(data.draftAnswers ?? {})) {
          initialAnswers[qid] = entry.selectedAnswer;
          initialMarked[qid] = !!entry.markedForReview;
          seqRef.current[qid] = entry.seq;
        }
        setAnswers(initialAnswers);
        setMarked(initialMarked);
      });
  }, [params.testId]);

  const current = test?.testQuestions[index];

  function autosave(questionId: string, selectedAnswer: string | string[] | null, markedForReview: boolean) {
    const nextSeq = (seqRef.current[questionId] ?? -1) + 1;
    seqRef.current[questionId] = nextSeq;
    fetch(`/api/tests/${params.testId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, seq: nextSeq, selectedAnswer, markedForReview }),
    }).catch(() => {
      // Best-effort — a retry buffer for transient failures would land
      // here in a later iteration; for now the next autosave call (or an
      // explicit "still saving" indicator) covers it.
    });
  }

  function handleChange(next: string | string[]) {
    if (!current) return;
    const qid = current.questionId;
    setAnswers((prev) => ({ ...prev, [qid]: next }));
    autosave(qid, next, marked[qid] ?? false);
  }

  function handleToggleMark() {
    if (!current) return;
    const qid = current.questionId;
    const next = !(marked[qid] ?? false);
    setMarked((prev) => ({ ...prev, [qid]: next }));
    autosave(qid, answers[qid] ?? null, next);
  }

  const statuses: Record<string, PaletteStatus> = useMemo(() => {
    const result: Record<string, PaletteStatus> = {};
    if (!test) return result;
    for (const tq of test.testQuestions) {
      const isAnswered = answers[tq.questionId] !== undefined && answers[tq.questionId] !== null;
      const isMarked = !!marked[tq.questionId];
      result[tq.questionId] = isMarked
        ? isAnswered
          ? "answered-marked"
          : "marked"
        : isAnswered
        ? "answered"
        : "unanswered";
    }
    return result;
  }, [test, answers, marked]);

  const answeredCount = Object.values(answers).filter((a) => a !== null && a !== undefined).length;

  async function handleSubmit() {
    setSubmitting(true);
    const res = await fetch(`/api/tests/${params.testId}/submit`, { method: "POST" });
    setSubmitting(false);
    if (res.ok) {
      router.push(`/tests/${params.testId}/result`);
    }
  }

  if (!test) {
    return <div className="max-w-4xl mx-auto p-10 text-sm text-slate">Loading…</div>;
  }

  if (test.status === "SUBMITTED") {
    router.replace(`/tests/${params.testId}/result`);
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <header className="flex items-center justify-between border-b border-[#E3E0DA] px-5 py-3 md:px-10">
        <Link href="/tests" className="text-sm text-[#77736D] underline-offset-2 hover:underline">
          ← Test history
        </Link>
        <Timer deadlineAt={test.deadlineAt} onExpire={handleSubmit} />
      </header>

      <div className="mx-auto flex max-w-4xl flex-col gap-8 p-5 md:flex-row md:p-10">
        <div className="flex flex-1 flex-col gap-4">
          <h1 className="text-lg font-semibold text-ink">{test.title}</h1>

          {current && (
            <QuestionCard
              question={current.question}
              index={index}
              total={test.testQuestions.length}
              selected={answers[current.questionId] ?? null}
              onChange={handleChange}
              onToggleMark={handleToggleMark}
              marked={!!marked[current.questionId]}
            />
          )}

          <div className="flex items-center justify-between">
            <Button
              variant="secondary"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </Button>
            {index < test.testQuestions.length - 1 ? (
              <Button onClick={() => setIndex((i) => Math.min(test.testQuestions.length - 1, i + 1))}>
                Next
              </Button>
            ) : (
              <Button onClick={() => setShowConfirm(true)}>Submit test</Button>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 md:w-56">
          <p className="text-sm font-semibold text-ink">Question palette</p>
          <Palette
            questions={test.testQuestions.map((tq) => ({ id: tq.questionId }))}
            currentIndex={index}
            statuses={statuses}
            onSelect={setIndex}
          />
          <Button variant="secondary" onClick={() => setShowConfirm(true)}>
            Submit test
          </Button>
        </div>

        {showConfirm && (
          <SubmitConfirm
            answeredCount={answeredCount}
            totalCount={test.testQuestions.length}
            onCancel={() => setShowConfirm(false)}
            onConfirm={handleSubmit}
          />
        )}

        {submitting && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/20 text-sm text-ink">
            Grading…
          </div>
        )}
      </div>
    </div>
  );
}
