import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/server/auth/require";
import { getResult } from "@/server/domains/tests/test.service";

function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  return String(value);
}

export default async function ResultPage({ params }: { params: { testId: string } }) {
  const user = await requireUser();
  const test = await getResult(params.testId, user.id).catch(() => null);
  if (!test) notFound();

  const attempt = test.attempts[0];
  if (!attempt) notFound();

  return (
    <AppShell active="tests">
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/tests" className="text-sm text-slate hover:text-ink">
          ← Test history
        </Link>
        <h1 className="text-xl font-semibold text-ink mt-2">{test.title}</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-card p-5 bg-butter">
          <p className="text-xs text-body-muted">Score</p>
          <p className="text-2xl font-semibold text-ink mt-1">
            {attempt.scoredMarks.toFixed(2)} / {attempt.totalMarks.toFixed(2)}
          </p>
        </div>
        <div className="rounded-card p-5 bg-sky">
          <p className="text-xs text-body-muted">Accuracy</p>
          <p className="text-2xl font-semibold text-ink mt-1">
            {(attempt.accuracy * 100).toFixed(0)}%
          </p>
        </div>
        <div className="rounded-card p-5 bg-mint">
          <p className="text-xs text-body-muted">Correct</p>
          <p className="text-2xl font-semibold text-ink mt-1">
            {attempt.answers.filter((a) => a.correct).length} / {attempt.answers.length}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {attempt.answers.map((a, i) => (
          <div key={a.id} className="rounded-card border border-line bg-white p-5">
            <div className="flex items-center justify-between text-xs text-slate mb-2">
              <span>
                Question {i + 1} &middot; {a.question.type} &middot; {a.marks >= 0 ? "+" : ""}
                {a.marks.toFixed(2)} marks
              </span>
              <span className={a.correct ? "text-teal font-medium" : "text-amber font-medium"}>
                {a.correct ? "Correct" : "Incorrect"}
              </span>
            </div>
            <p className="text-sm text-ink whitespace-pre-wrap mb-3">{a.question.statement}</p>
            <div className="text-xs text-slate flex flex-col gap-1">
              <p>Your answer: {formatAnswer(a.selectedAnswer)}</p>
              <p>Correct answer: {formatAnswer(a.question.correctAnswer)}</p>
              {a.question.solution && (
                <p className="mt-2 text-ink-soft whitespace-pre-wrap">{a.question.solution}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
    </AppShell>
  );
}
