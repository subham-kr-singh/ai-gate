import Link from "next/link";
import { PASTEL_CLASS, formatDay, pct } from "@/components/planner/format";
import { AppShell } from "@/components/shell/AppShell";
import { PhaseTrack, ProgressBar, ReasonRows, StatTile, cardClass } from "@/components/planner/ui";
import { requireUserId } from "@/server/auth/session";
import type { PaceReport, WhyType } from "@/server/domains/analytics/pace.service";
import { getProgressReports } from "@/server/domains/planner/planner.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

const WHY_LABEL: Record<WhyType, string> = {
  EXTRA_TIME: "Time",
  PREREQUISITE_GAPS: "Prerequisites",
  LOW_PYQ: "PYQs",
  OPEN_MISTAKES: "Mistakes",
  REVISION_BACKLOG: "Revision",
  SLOW_SUBJECT: "Pace",
  UNRESOLVED_CARRYOVER: "Carry-over",
};

function paceSentence(p: PaceReport): string {
  if (p.status === "NO_EXAM_DATE") return "Set an exam date on the Today screen to see your pace.";
  if (p.remainingUnitEquivalents < 0.5) return "The syllabus is essentially covered.";
  const finish = formatDay(p.projectedFinishKey);
  const slack = Math.abs(p.slackDays ?? 0);
  const days = `${slack} ${slack === 1 ? "day" : "days"}`;
  if (p.status === "ON_TRACK") return `At your current pace you finish the syllabus on ${finish}, ${days} before revision-focused phase 3 begins.`;
  return `At your current pace you finish the syllabus on ${finish}, ${days} after phase 3 begins.`;
}

export default async function ReportsPage() {
  const userId = await requireUserId();
  const r = await getProgressReports(userId);
  const { evidence: e, pace, phase } = r;
  const tone = pace.status === "ON_TRACK" ? "teal" : "amber";

  return (
    <AppShell
      aside={
        <>
          <PhaseTrack phase={phase} />
          <div>
            <p className="mb-2 text-sm font-semibold">Pace</p>
            <dl className="flex flex-col divide-y divide-[#E3E0DA] text-sm">
              {[
                ["Days to exam", pace.daysToExam == null ? "Not set" : String(pace.daysToExam)],
                ["Coverage due by", formatDay(pace.coverageDeadlineKey)],
                ["Projected finish", formatDay(pace.projectedFinishKey)],
                ["Units left", pace.remainingUnitEquivalents.toFixed(1)],
                ["Your pace", r.velocity.averageDays == null ? "Not enough data" : `${r.velocity.averageDays.toFixed(1)} days per unit`],
                ["Needed", pace.requiredUnitsPerDay == null ? "Not set" : `${pace.requiredUnitsPerDay.toFixed(2)} units per study day`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2">
                  <dt className="text-[#77736D]">{k}</dt>
                  <dd className="text-right tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      }
    >
      <header>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-[#77736D]">Where you stand, and what is slowing you down.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile fill={PASTEL_CLASS.sky} label="Syllabus coverage" value={pct(e.syllabusCoverage)} note={`${pace.remainingUnitEquivalents.toFixed(1)} units of syllabus left`} />
        <StatTile fill={PASTEL_CLASS.butter} label="Concept mastery" value={pct(e.mastery, "No data")} note="Across units you have practised" />
        <StatTile fill={PASTEL_CLASS.lavender} label="PYQ accuracy" value={pct(e.pyqAccuracy, "No data")} note={`${e.pyqAttempted} PYQs attempted`} />
      </div>

      <section className={`${cardClass} p-5`} aria-labelledby="track">
        <h2 id="track" className="font-semibold">Am I on track?</h2>
        <p className="mt-1 text-sm">
          {pace.status !== "NO_EXAM_DATE" && (
            <span className={`mr-2 text-xs font-medium ${tone === "teal" ? "text-[#0E8074]" : "text-[#D98E2B]"}`}>
              {pace.status === "ON_TRACK" ? "On track" : pace.status === "NEEDS_ATTENTION" ? "Needs attention" : "Behind pace"}
            </span>
          )}
          {paceSentence(pace)}
        </p>
        <div className="mt-5 flex flex-col gap-4">
          <div>
            <div className="mb-1 flex justify-between text-sm"><span>Revision coverage</span><span className="tabular-nums text-[#77736D]">{pct(e.revisionCoverage, "No data")}</span></div>
            <ProgressBar value={e.revisionCoverage ?? 0} tone="teal" label="Revision coverage" />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm"><span>Mocks</span><span className="tabular-nums text-[#77736D]">{e.mocksCompleted} of {e.mockTarget}</span></div>
            <ProgressBar value={e.mocksCompleted / e.mockTarget} label="Mocks completed" />
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-5`} aria-labelledby="why">
        <h2 id="why" className="font-semibold">Why progress slowed</h2>
        {r.why.length ? (
          <ReasonRows rows={r.why.map((w) => ({ text: w.text, value: WHY_LABEL[w.type], tone: "amber" as const }))} />
        ) : (
          <p className="mt-1 text-sm text-[#77736D]">Nothing is slowing you down right now.</p>
        )}
      </section>

      <section className={`${cardClass} p-5`} aria-labelledby="weekly">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="weekly" className="font-semibold">Weekly review</h2>
          {r.weekly && <span className="text-xs text-[#77736D]">{formatDay(r.weekly.capturedOn)}</span>}
        </div>
        {r.weekly ? (
          <>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {r.weekly.report.summary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            {(r.weekly.report.improvements.length > 0 || r.weekly.report.regressions.length > 0) && (
              <div className="mt-3 border-t border-[#E3E0DA]">
                <ReasonRows
                  rows={[
                    ...r.weekly.report.improvements.map((m) => ({ text: m.name, value: `+${Math.round(m.delta * 100)} points`, tone: "teal" as const })),
                    ...r.weekly.report.regressions.map((m) => ({ text: m.name, value: `${Math.round(m.delta * 100)} points`, tone: "amber" as const })),
                  ]}
                />
              </div>
            )}
          </>
        ) : (
          <p className="mt-1 max-w-md text-sm text-[#77736D]">
            Your first weekly review is written after the first Sunday-night run. Until then, the numbers above are live.
          </p>
        )}
      </section>

      {r.needsSetup && (
        <p className="text-sm text-[#77736D]">
          Pace needs an exam date. <Link href="/planner" className="underline">Set it on the Today screen.</Link>
        </p>
      )}
    </AppShell>
  );
}
