"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { ActivityChart } from "./ActivityChart";
import { FilterDropdown } from "./FilterDropdown";
import type { ActivitySeries } from "@/server/domains/mastery/dashboard.queries";
import type { Overview } from "@/server/domains/mastery/mastery.queries";
import { PASTEL_CLASS, type PastelTone } from "@/components/ui/tokens";

export interface SubjectOption {
  subjectId: string;
  subject: string;
  questionsLast7d: number;
  openMistakes: number;
  unitsStarted: number;
  totalUnits: number;
  coverage: number;
  mastery: number;
}

interface Props {
  /** Activity for the trailing week; the 30-day view is lazily fetched. */
  week: ActivitySeries;
  overview: Overview;
  subjects: SubjectOption[];
  /** Currently applied subject filter, from the URL. */
  subjectId: string | null;
  daysToExam: number | null;
  weekStrip: { key: string; weekday: string; dayOfMonth: string; isToday: boolean }[];
}

type Range = 7 | 30;

const RANGES: { days: Range; label: string }[] = [
  { days: 7, label: "Weekly" },
  { days: 30, label: "Monthly" },
];

/**
 * Dashboard interactivity: the activity range toggle, the subject filter, and
 * the chart readout. Server components above supply already-computed values,
 * so switching range or subject is instant. The subject filter navigates with
 * the URL so the whole page (tiles, continue-learning, revision) is scoped
 * server-side and no two sections can disagree about what is being shown.
 */
export function DashboardPanel({
  week,
  overview,
  subjects,
  subjectId,
  daysToExam,
  weekStrip,
}: Props): ReactNode {
  const [range, setRange] = useState<Range>(7);
  const [hovered, setHovered] = useState<{ day: string; attempted: number; correct: number } | null>(null);
  const [month, setMonth] = useState<ActivitySeries | null>(null);
  const [monthState, setMonthState] = useState<"idle" | "loading" | "error">("idle");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  // Fetch the 30-day series the first time it's needed, then keep it. Nothing
  // is fetched on load, so the weekly view stays a single round trip.
  useEffect(() => {
    if (range !== 30 || monthState !== "idle") return;
    let cancelled = false;
    setMonthState("loading");
    const qs = new URLSearchParams({ days: "30" });
    if (subjectId) qs.set("subject", subjectId);
    fetch(`/api/dashboard/activity?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: ActivitySeries) => {
        if (!cancelled) {
          setMonth(data);
          setMonthState("idle");
        }
      })
      .catch(() => {
        if (!cancelled) setMonthState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [range, monthState, subjectId]);

  const active = subjectId ? subjects.find((s) => s.subjectId === subjectId) ?? null : null;
  const series = range === 30 && month ? month : week;
  const readout = hovered ?? (series.points.at(-1)
    ? { day: series.points.at(-1)!.day, attempted: series.points.at(-1)!.attempted, correct: series.points.at(-1)!.correct }
    : null);

  const setSubject = (id: string | null) => {
    const params = new URLSearchParams();
    if (id) params.set("subject", id);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <>
      <section aria-label="Activity" className="rounded-[24px] bg-teal p-6 text-white md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold" style={{ fontSize: "clamp(18px,1.8vw,24px)" }}>
              {active ? active.subject : "Your week in practice"}
            </h2>
            <p className="mt-1 text-sm text-white/80">
              {readout
                ? `${fmtDay(readout.day)} — ${readout.attempted} attempted, ${readout.correct} correct`
                : "No activity in this window yet."}
            </p>
          </div>
          <div className={`flex items-center gap-2 ${pending ? "opacity-70" : ""}`}>
            <FilterDropdown
              value={subjectId}
              srLabel="Filter by subject"
              allLabel="All subjects"
              label={active ? active.subject : "All subjects"}
              options={subjects.map((s) => ({
                value: s.subjectId,
                label: s.subject,
                hint: s.questionsLast7d > 0 ? String(s.questionsLast7d) : undefined,
              }))}
              onChange={setSubject}
            />
            <div role="group" aria-label="Activity range" className="flex rounded-full bg-white/15 p-1">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  aria-pressed={range === r.days}
                  onClick={() => setRange(r.days)}
                  className={`h-8 rounded-full px-3 text-xs ${range === r.days ? "bg-white text-ink" : "text-white"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <ActivityChart
            points={series.points}
            onHoverChange={(p) => setHovered(p ? { day: p.day, attempted: p.attempted, correct: p.correct } : null)}
          />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/20 pt-4 sm:grid-cols-4">
          <Stat label="Attempted" value={String(series.totalAttempted)} />
          <Stat label="Accuracy" value={series.totalAttempted === 0 ? "\u2014" : pct(series.totalCorrect / series.totalAttempted)} />
          <Stat label="Streak" value={`${series.streak} ${series.streak === 1 ? "day" : "days"}`} />
          <Stat label="Active-day avg" value={String(series.activeDayAverage)} />
        </dl>

        <p className="mt-3 min-h-[1rem] text-xs text-white/70" role="status">
          {range === 30 && monthState === "loading" && "Loading 30-day history\u2026"}
          {range === 30 && monthState === "error" && (
            <>
              Showing the last 7 days \u2014 the 30-day history didn\u2019t load.{" "}
              <button type="button" className="underline underline-offset-2" onClick={() => setMonthState("idle")}>
                Try again
              </button>
            </>
          )}
        </p>
      </section>

      <section aria-label="Summary" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ScopedTile
          tone="butter"
          label="Questions this week"
          value={String(active ? active.questionsLast7d : series.totalAttempted)}
          note={active ? `${active.subject} \u00b7 last 7 days` : `${series.points.at(-1)?.attempted ?? 0} today`}
        />
        <ScopedTile
          tone="sky"
          label="Syllabus coverage"
          value={pct(active ? active.coverage : overview.coverage)}
          note={`${active ? active.unitsStarted : overview.unitsStarted} / ${active ? active.totalUnits : overview.totalUnits} units started`}
        />
        <ScopedTile
          tone="lavender"
          label="Mocks completed"
          value={String(overview.mocksCompleted)}
          note={`Target ${overview.mocksTarget} \u00b7 ${overview.mocksCompleted >= overview.mocksTarget ? "on pace" : "behind pace"}`}
          accent={
            overview.mocksCompleted >= overview.mocksTarget ? undefined : "amber"
          }
        />
      </section>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Exam week</h2>
          {daysToExam !== null && (
            <span className="text-sm text-slate">
              {daysToExam} {daysToExam === 1 ? "day" : "days"} to exam
            </span>
          )}
        </div>
        <ol className="m-0 mt-3 flex list-none items-center justify-between gap-1 p-0" aria-label="This week">
          {weekStrip.map((d) => (
            <li key={d.key} className="flex flex-col items-center gap-1">
              <span className="text-xs text-slate">{d.weekday.slice(0, 1)}</span>
              <span
                aria-current={d.isToday ? "date" : undefined}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs tabular-nums ${
                  d.isToday ? "bg-ink text-white" : "text-ink"
                }`}
              >
                {d.dayOfMonth}
              </span>
              {d.isToday && <span className="sr-only">today</span>}
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-white/70">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-white">{value}</dd>
    </div>
  );
}

/** Stat tile for the filtered view; pastels are the DESIGN.md tile tokens. */
function ScopedTile({
  tone,
  label,
  value,
  note,
  accent,
}: {
  /** Pastel fill, as a union so an off-palette color cannot be passed in. */
  tone: PastelTone;
  label: string;
  value: string;
  note: string;
  /** Amber is reserved for attention states only (DESIGN.md §2). */
  accent?: "amber";
}) {
  return (
    <div className={`rounded-[20px] p-5 ${PASTEL_CLASS[tone]}`}>
      <p className="text-xs text-body-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className={`mt-1 text-xs ${accent === "amber" ? "text-amber" : "text-body-muted"}`}>{note}</p>
    </div>
  );
}

function fmtDay(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
}
