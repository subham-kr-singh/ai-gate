import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getCurrentUser } from "@/server/auth/session"; // Part 1
import { generateTodaysDPP } from "@/server/domains/dpp/dpp.service";
import { DPP_CONFIG_V1, type DPPSource } from "@/server/domains/dpp/dpp.config";
import { getQuestionsByIds } from "@/server/domains/questions/question.service"; // Part 2

export const dynamic = "force-dynamic";

/**
 * Styled against design.md (canonical per dashboard-demo.html) — NOT the
 * earlier dark-navy "Drafting Table" system. Colors are the literal hex
 * values from that doc's palette table rather than semantic class names,
 * matching how dashboard-demo.html itself is written, so this page reads
 * as the same product as the dashboard rather than a different app.
 *
 * Per design.md's color rule: teal (#0E8074) is reserved for positive/
 * progress signals, amber (#D98E2B) for attention/urgent/weak — never
 * swapped for decoration. WEAK, MISTAKE and REVISION are the "this needs
 * attention" buckets and get the amber label; PREREQUISITE, PYQ and
 * MIXED are steady practice, so they stay in neutral slate.
 */
const SOURCE_LABEL: Record<DPPSource, string> = {
  WEAK: "Weak concept",
  PREREQUISITE: "Prerequisite gap",
  REVISION: "Review due",
  MISTAKE: "Previous mistake",
  PYQ: "Previous-year question",
  MIXED: "Practice",
};

function isUrgentSource(source: DPPSource): boolean {
  return source === "WEAK" || source === "MISTAKE" || source === "REVISION";
}

export default async function DppPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  const dpp = await generateTodaysDPP({ userId: session.id, date: new Date() }, DPP_CONFIG_V1);
  const questions = await getQuestionsByIds(dpp.questions.map((q) => q.questionId));
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const total = dpp.questions.length;
  const completed = dpp.questions.filter((q) => q.completedAt).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const nextUp = dpp.questions.find((q) => !q.completedAt);

  return (
    <AppShell
      active="practice"
      initial={(session.name ?? session.email)[0]?.toUpperCase()}
      width="reading"
    >
      <div className="flex flex-col gap-7">
      {/* Header — matches the dashboard's greeting/meta pairing */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate">Today&apos;s practice</p>
          <h1 className="text-xl font-semibold text-ink">Daily Practice Problems</h1>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-ink">
            {completed}
            <span className="text-slate-light">/{total}</span>
          </p>
          <p className="text-xs text-slate">complete</p>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-[20px] border border-line p-6 text-sm text-slate">
          No practice set could be generated yet — attempt a few questions or log a study report so
          there&apos;s something to build today&apos;s set from.
        </div>
      ) : (
        <>
          {/* Progress bar, same device as the continue-learning cards on the dashboard */}
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
              <div
                className="animate-fill-w h-full rounded-full bg-teal"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate">{percent}% complete</p>
          </div>

          {nextUp && (
            <Link
              href={`/practice/dpp/${dpp.dppId}/question/${nextUp.questionId}`}
              className="inline-flex h-10 w-fit items-center rounded-full bg-ink px-5 text-sm font-medium text-white"
            >
              Continue — question {nextUp.position} of {total}
            </Link>
          )}

          {/* Question list — same panel treatment as "Memory Management — concepts" on the dashboard */}
          <div className="rounded-[20px] border border-line p-5">
            <p className="mb-3 font-semibold text-ink">Question set</p>
            <ul className="flex flex-col divide-y divide-line">
              {dpp.questions.map((item) => {
                const question = questionById.get(item.questionId);
                const urgent = isUrgentSource(item.source);
                return (
                  <li key={item.questionId} className="flex items-center justify-between py-3">
                    <Link
                      href={`/practice/dpp/${dpp.dppId}/question/${item.questionId}`}
                      className="min-w-0 flex-1 pr-4"
                    >
                      <p className="truncate text-sm text-ink">
                        {question?.statement?.substring(0, 50) ?? `Question ${item.position}`}
                      </p>
                      <p className={`mt-0.5 text-xs ${urgent ? "text-amber" : "text-slate"}`}>
                        {SOURCE_LABEL[item.source]}
                      </p>
                    </Link>
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        item.completedAt
                          ? item.correct
                            ? "text-teal"
                            : "text-amber"
                          : "text-slate-light"
                      }`}
                    >
                      {item.completedAt ? (item.correct ? "Correct" : "Incorrect") : "Not attempted"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
      </div>
    </AppShell>
  );
}
