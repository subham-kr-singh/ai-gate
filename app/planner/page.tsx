import Link from "next/link";
import { OverrideControls } from "@/components/planner/OverrideControls";
import { PlanSettingsForm } from "@/components/planner/PlanSettingsForm";
import { ACTION_LABEL, PASTEL_CLASS, describeReason, formatDay, headline, pct, reasonTone, reasonValue, weekDays } from "@/components/planner/format";
import { AppShell } from "@/components/shell/AppShell";
import { PhaseTrack, ProgressBar, ReasonRows, StatTile, SubjectBadge, WeekStrip, cardClass, pillDark } from "@/components/planner/ui";
import { requireUserId } from "@/server/auth/session";
import { getPlanSettings, getToday } from "@/server/domains/planner/planner.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

export default async function PlannerPage() {
  const userId = await requireUserId();
  const [t, settings] = await Promise.all([getToday(userId), getPlanSettings(userId)]);
  const { primary, alternatives, pace, phase, evidence } = t;
  const isGlobal = primary?.targetType === "GLOBAL";

  const paceLabel =
    pace.status === "ON_TRACK" ? { text: "On track", tone: "teal" as const }
    : pace.status === "NEEDS_ATTENTION" ? { text: "Needs attention", tone: "amber" as const }
    : pace.status === "BEHIND" ? { text: "Behind pace", tone: "amber" as const }
    : undefined;

  const reasonRows = (primary?.reasons ?? []).map((r) => ({ text: describeReason(r), value: reasonValue(r), tone: reasonTone([r]) }));

  return (
    <AppShell
      aside={
        <>
          <div>
            <p className="text-lg font-semibold tabular-nums">
              {t.needsSetup ? "Exam date not set" : `${phase.daysToExam} ${phase.daysToExam === 1 ? "day" : "days"} to exam`}
            </p>
            <div className="mt-3">
              <PhaseTrack phase={phase} />
            </div>
            <WeekStrip days={weekDays(t.forDate)} />
            <Link href="/study-report" className={`${pillDark} mt-4 w-full`}>
              + Log study session
            </Link>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Due for review</p>
            <ul className="flex flex-col gap-3 text-sm">
              <li>
                <Link href="/flashcards" className="flex items-center justify-between">
                  <span>Flashcards</span>
                  <span className={`tabular-nums ${t.due.flashcards > 0 ? "text-[#D98E2B]" : "text-[#77736D]"}`}>{t.due.flashcards}</span>
                </Link>
              </li>
              <li className="flex items-center justify-between">
                <span>Concepts overdue</span>
                <span className={`tabular-nums ${t.due.conceptReviews > 0 ? "text-[#D98E2B]" : "text-[#77736D]"}`}>{t.due.conceptReviews}</span>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Needs attention</p>
            {t.needsAttention.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {t.needsAttention.map((u) => (
                  <li key={u.unitId} className="flex items-center justify-between gap-3">
                    <span className="truncate">{u.unitName}</span>
                    <span className="shrink-0 tabular-nums text-[#D98E2B]">{pct(u.mastery)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#77736D]">No weak units yet. Answer a few questions in a unit and it will show up here.</p>
            )}
          </div>

          {!t.needsSetup && (
            <details className="border-t border-[#E3E0DA] pt-4">
              <summary className="cursor-pointer text-sm font-semibold">Plan settings</summary>
              <div className="mt-3">
                <PlanSettingsForm initial={settings} />
              </div>
            </details>
          )}
        </>
      }
    >
      <header>
        <h1 className="text-xl font-semibold">Today</h1>
        <p className="text-sm text-[#77736D]">{formatDay(t.forDate)}</p>
      </header>

      {t.needsSetup && (
        <section className={`${cardClass} p-5`} aria-labelledby="setup">
          <h2 id="setup" className="font-semibold">Set your exam date</h2>
          <p className="mb-4 mt-1 max-w-md text-sm text-[#77736D]">
            The planner splits your time into four phases and paces the syllabus against them. Until then it assumes phase 1.
          </p>
          <div className="max-w-sm">
            <PlanSettingsForm initial={settings} />
          </div>
        </section>
      )}

      <section className="rounded-[24px] bg-[#0E8074] p-7 text-white md:p-8" aria-labelledby="hero">
        <h2 id="hero" className="font-semibold leading-[1.05]" style={{ fontSize: "clamp(24px,2.6vw,34px)" }}>
          {primary ? headline(primary) : "Nothing is due right now."}
        </h2>
        <p className="mt-2 max-w-md text-sm text-white/80">
          {primary
            ? (primary.reasons.slice(0, 2).map(describeReason).join(" ") || "This is the highest-priority work at the moment.")
            : "Log what you studied outside the app, or start the next unit from the syllabus."}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          fill={PASTEL_CLASS.butter}
          label="Days to exam"
          value={t.needsSetup ? "Not set" : String(phase.daysToExam)}
          note={`Phase ${phase.phase} of 4${phase.daysLeftInPhase != null ? `, ${phase.daysLeftInPhase} days left in it` : ""}`}
        />
        <StatTile
          fill={PASTEL_CLASS.sky}
          label="Syllabus coverage"
          value={pct(evidence.syllabusCoverage)}
          delta={paceLabel?.text}
          deltaTone={paceLabel?.tone}
          note={pace.projectedFinishKey ? `Projected finish ${formatDay(pace.projectedFinishKey)}` : "Set an exam date to see pace"}
        />
        <StatTile
          fill={PASTEL_CLASS.lavender}
          label="Mocks completed"
          value={`${evidence.mocksCompleted} / ${evidence.mockTarget}`}
          note={phase.phase >= 3 ? "Mocks are part of the plan now" : "Mocks start in phase 3"}
        />
      </div>

      {primary ? (
        <section className={`${cardClass} p-5`} aria-labelledby="next">
          <div className="flex items-start gap-3">
            <SubjectBadge name={primary.subjectName} code={isGlobal ? (primary.action === "TAKE_MOCK" ? "MK" : "FC") : undefined} />
            <div className="min-w-0">
              <h2 id="next" className="font-semibold">{ACTION_LABEL[primary.action]}{primary.conceptName ? `: ${primary.conceptName}` : ""}</h2>
              {primary.unitName && (
                <p className="text-xs text-[#77736D]">
                  {primary.subjectName}, {primary.unitName}
                </p>
              )}
            </div>
          </div>

          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm">
            {primary.steps.map((s, i) => (
              <li key={i}>{s.label}</li>
            ))}
          </ol>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link href={primary.href} className={pillDark}>
              Start
            </Link>
          </div>

          <div className="mt-5 border-t border-[#E3E0DA] pt-4">
            <OverrideControls
              decisionId={t.decisionId}
              recommendedUnitId={primary.unitId}
              recommendedUnitName={primary.unitName}
              units={t.unitOptions}
            />
          </div>

          {reasonRows.length > 0 && (
            <div className="mt-2 border-t border-[#E3E0DA] pt-4">
              <h3 className="mb-1 text-sm font-semibold">Why this?</h3>
              <ReasonRows rows={reasonRows} />
            </div>
          )}
        </section>
      ) : (
        <section className={`${cardClass} p-5`}>
          <h2 className="font-semibold">You are clear for now</h2>
          <p className="mt-1 max-w-md text-sm text-[#77736D]">
            No unit is active and no review is due. Pick your next unit from the syllabus, or answer a few questions to give the planner something to work with.
          </p>
          <Link href="/syllabus" className={`${pillDark} mt-4`}>
            Open the syllabus
          </Link>
        </section>
      )}

      {alternatives.length > 0 && (
        <section aria-labelledby="also">
          <div className="mb-3 flex items-center justify-between">
            <h3 id="also" className="font-semibold">Also worth doing</h3>
            <span className="text-sm text-[#77736D]">{alternatives.length} more</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {alternatives.map((c) => {
              const prog = c.unitId ? t.unitProgress[c.unitId] : undefined;
              return (
                <Link key={c.id} href={c.href} className={`${cardClass} p-5 hover:bg-[#F8F6F2]`}>
                  <SubjectBadge name={c.subjectName} code={c.targetType === "GLOBAL" ? (c.action === "TAKE_MOCK" ? "MK" : "FC") : undefined} />
                  <p className="mt-3 font-semibold">{c.conceptName ?? c.unitName ?? ACTION_LABEL[c.action]}</p>
                  <p className="text-xs text-[#77736D]">{ACTION_LABEL[c.action]}{c.unitName && c.conceptName ? `, ${c.unitName}` : ""}</p>
                  {prog ? (
                    <div className="mt-3">
                      <ProgressBar value={prog.coverage} label={`${c.unitName} coverage`} />
                      <p className="mt-1 text-xs text-[#77736D]">{pct(prog.coverage)} covered</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[#77736D]">{c.reasons[0] ? describeReason(c.reasons[0]) : ""}</p>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </AppShell>
  );
}
