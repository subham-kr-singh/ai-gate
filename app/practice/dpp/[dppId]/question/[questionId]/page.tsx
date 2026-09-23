import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { DppQuestionCard } from "@/components/dpp/DppQuestionCard";
import { GATE_EXAM_YEAR } from "@/lib/exam";
import { getCurrentUser } from "@/server/auth/session";
import { generateTodaysDPP } from "@/server/domains/dpp/dpp.service";
import { DPP_CONFIG_V1, type DPPSource } from "@/server/domains/dpp/dpp.config";
import { db } from "@/server/db/client";
import { getQuestionsByIds } from "@/server/domains/questions/question.service";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<DPPSource, string> = {
  WEAK: "Weak concept",
  PREREQUISITE: "Prerequisite gap",
  REVISION: "Review due",
  MISTAKE: "Previous mistake",
  PYQ: "Previous-year question",
  MIXED: "Practice",
};

/**
 * One question of today's practice set. Answers are graded on the server the
 * moment they are submitted (no draft state — a DPP question is answered once),
 * and the outcome is shown inline with the solution, then the next unanswered
 * question is offered. Sits in the standard shell: this is daily practice, not
 * an exam, so the nav rail stays available.
 */
export default async function DppQuestionPage({
  params,
}: {
  params: { dppId: string; questionId: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dpp = await generateTodaysDPP({ userId: user.id, date: new Date() }, DPP_CONFIG_V1);
  if (dpp.dppId !== params.dppId) redirect(`/practice/dpp/${dpp.dppId}/question/${params.questionId}`);

  const slot = dpp.questions.find((q) => q.questionId === params.questionId);
  if (!slot) notFound();

  const [question] = await getQuestionsByIds([params.questionId]);
  if (!question) notFound();

  // Restores what the student actually picked so a refresh shows the same
  // recap rather than an empty, unexplained "not answered" state.
  const priorAnswer = slot.completedAt
    ? await db.answer.findFirst({
        where: { userId: user.id, questionId: params.questionId },
        orderBy: { createdAt: "desc" },
        select: { selectedAnswer: true },
      })
    : null;
  const priorSelected = (priorAnswer?.selectedAnswer ?? null) as string | string[] | null;

  const position = dpp.questions.findIndex((q) => q.questionId === params.questionId) + 1;
  const next = dpp.questions.find((q) => !q.completedAt && q.questionId !== params.questionId);
  const answered = dpp.questions.filter((q) => q.completedAt).length;

  return (
    <AppShell active="practice" initial={(user.name ?? user.email)[0]?.toUpperCase()}>
      <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-5">
        <nav className="flex items-center justify-between text-sm">
          <Link href="/practice/dpp" className="text-slate underline-offset-2 hover:underline">
            Today&apos;s practice set
          </Link>
          <span className="text-slate">
            {answered} of {dpp.questions.length} answered
          </span>
        </nav>

        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-ink">
            Question {position} of {dpp.questions.length}
          </h1>
          <span className="text-xs text-slate">{SOURCE_LABEL[slot.source]}</span>
        </div>

        <DppQuestionCard
          dppId={dpp.dppId}
          question={{
            id: question.id,
            type: question.type,
            statement: question.statement,
            options: (question.options as { id: string; text: string }[] | null) ?? null,
            marks: question.marks,
            solution: question.solution ?? null,
            year: question.year ?? null,
            examYear: GATE_EXAM_YEAR,
          }}
          alreadyAnswered={Boolean(slot.completedAt)}
          previousOutcome={slot.completedAt ? { correct: Boolean(slot.correct) } : null}
          initialSelected={priorSelected}
          correctAnswer={
            Array.isArray(question.correctAnswer)
              ? (question.correctAnswer as string[])
              : typeof question.correctAnswer === "string"
                ? [question.correctAnswer]
                : null
          }
          nextHref={next ? `/practice/dpp/${dpp.dppId}/question/${next.questionId}` : undefined}
        />
      </div>
    </AppShell>
  );
}