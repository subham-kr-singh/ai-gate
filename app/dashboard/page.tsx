import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPanel, type SubjectOption } from "@/components/dashboard/DashboardPanel";
import { CoverageBadge } from "@/components/dashboard/CoverageBadge";
import { MasteryBar } from "@/components/dashboard/MasteryBar";
import { SubjectBadge } from "@/components/dashboard/SubjectBadge";
import { WeakConceptList } from "@/components/dashboard/WeakConceptList";
import { AppShell } from "@/components/shell/AppShell";
import { weekDays } from "@/components/planner/format";
import { primaryReason } from "@/lib/reason-text";
import { ui } from "@/lib/ui-tokens";
import { getCurrentUser } from "@/server/auth/session";
import { getActivitySeries, getSubjectRollups } from "@/server/domains/mastery/dashboard.queries";
import {
  getContinueLearning,
  getOverview,
  getPendingRevision,
  getWeakConcepts,
} from "@/server/domains/mastery/mastery.queries";
import { getPlanSettings, getToday } from "@/server/domains/planner/planner.service";

export const dynamic = "force-dynamic";

/** Whole days from `from` to `to`, both YYYY-MM-DD, at UTC midnight. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { subject?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = (user as { name?: string | null }).name || user!.email.split("@")[0] || "Student";

  // The plan owns the timezone, and every day-bucketed read below needs it, so
  // both are resolved before the parallel batch.
  const [today, settings] = await Promise.all([getToday(user.id), getPlanSettings(user.id)]);
  const tz = settings.timezone;

  const [overview, rollups, allWeek] = await Promise.all([
    getOverview(user.id),
    getSubjectRollups(user.id),
    getActivitySeries(user.id, { days: 7, timezone: tz }),
  ]);

  const subjects: SubjectOption[] = rollups.map((r) => ({
    subjectId: r.subjectId,
    subject: r.subject,
    questionsLast7d: r.questionsLast7d,
    openMistakes: r.openMistakes,
    unitsStarted: r.unitsStarted,
    totalUnits: r.totalUnits,
    coverage: r.coverage,
    mastery: r.mastery,
  }));

  // An unknown ?subject= is ignored rather than erroring, and only ids that
  // exist in `subjects` ever reach a query.
  const requested = searchParams?.subject ?? null;
  const subjectId = requested && subjects.some((s) => s.subjectId === requested) ? requested : null;

  // The week is fetched unscoped in the batch above (so it can run in parallel
  // with the rollups the filter is validated against), then re-read only when a
  // filter actually narrows it. With no filter this is the value already in
  // hand, and the 30-day series is left to the chart to request on demand.
  const week = subjectId ? await getActivitySeries(user.id, { days: 7, timezone: tz, subjectId }) : allWeek;

  const [continueLearning, revision, weakConcepts] = await Promise.all([
    getContinueLearning(user.id, 3, subjectId),
    getPendingRevision(user.id, 4, new Date(), subjectId),
    getWeakConcepts(user.id, 4, new Date(), subjectId),
  ]);

  const strip = weekDays(today.forDate);
  const daysToExam = settings.examDate ? daysBetween(today.forDate, settings.examDate) : null;

  const aside = (
    <>
      <Link href="/study-report" className={`${ui.btn} w-full`}>+ Log study session</Link>

      <Link
        href="/tutor"
        className="text-sm text-ink underline-offset-2 hover:underline"
      >
        Tutor — describe a session and I&apos;ll draft the report
      </Link>

      <section aria-labelledby="pending-revision">
        <h2 id="pending-revision" className="mb-2 text-sm font-semibold text-ink">Pending revision</h2>
        {revision.length === 0 ? (
          <p className="text-sm text-slate">Nothing due. Reviews are scheduled as you practice.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {revision.map((r) => (
              <li key={r.conceptId}>
                {r.retention === null ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink">{r.name}</span>
                    <span className="text-slate">New</span>
                  </div>
                ) : (
                  <MasteryBar label={r.name} value={r.retention} tone="teal" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="needs-attention">
        <h2 id="needs-attention" className="mb-2 text-sm font-semibold text-ink">Needs attention</h2>
        <WeakConceptList items={weakConcepts} />
      </section>
    </>
  );

  return (
    <AppShell active="today" initial={(name[0] ?? "G").toUpperCase()} aside={aside}>
      <div>
        <p className="text-sm text-slate">Welcome back,</p>
        <h1 className="text-xl font-semibold text-ink">{name}</h1>
      </div>

      <DashboardPanel
        week={week}
        overview={overview}
        subjects={subjects}
        subjectId={subjectId}
        daysToExam={daysToExam}
        weekStrip={strip}
      />

      <section aria-labelledby="continue">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="continue" className="font-semibold text-ink">
            Continue learning
          </h2>
          <span className="text-sm text-slate">{overview.weakUnitCount} in progress</span>
        </div>
        {continueLearning.length === 0 ? (
          <p className="text-sm text-slate">
            {subjectId
              ? "No units in progress for this subject. Take a topic quiz to start one."
              : "No units in progress. Take a topic quiz or log a study session to start one."}
          </p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
            {continueLearning.map((u) => (
              <li key={u.unitId}>
                <Link href={`/syllabus/${u.subjectId}`} className="block h-full rounded-[20px] border border-line bg-white p-5">
                  <SubjectBadge subject={u.subject} subjectId={u.subjectId} />
                  <p className="mt-3 font-semibold text-ink">{u.unit}</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate">{u.subject}</p>
                    <CoverageBadge status={u.status} />
                  </div>
                  <MasteryBar value={u.coverage} caption={`${Math.round(u.coverage * 100)}% covered`} />
                  {primaryReason(u.reasons) && <p className="mt-1 text-xs text-body-muted">{primaryReason(u.reasons)}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
