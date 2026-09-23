/**
 * Building blocks copied from design.md / dashboard-demo-v3.html. Server-safe
 * (no hooks). Colours come from the Tailwind tokens in `tailwind.config.ts`,
 * which mirror DESIGN.md.
 */
import type { ReactNode } from "react";
import type { PhaseInfo } from "@/server/domains/planner/planner.types";
import { PASTEL_CLASS, formatDayShort, subjectBadge, type PastelTone } from "./format";
import "./planner.css";

// Re-exported so planner/reports keep their single import site; the
// implementation lives in components/ui so there is only one progress bar.
export { ProgressBar } from "@/components/ui/ProgressBar";

export const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
export const pillDark = `inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-white ${focusRing}`;
export const pillSoft = `inline-flex h-9 items-center justify-center rounded-full bg-control px-4 text-sm text-ink-soft hover:bg-line ${focusRing}`;
export const cardClass = "rounded-[20px] border border-line bg-white";


export function SubjectBadge({ name, code: forced }: { name: string | null; code?: string }) {
  const badge = subjectBadge(name);
  const code = forced ?? badge.code;
  return (
    <div aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-ink ${badge.fill}`}>
      {code}
    </div>
  );
}

export function StatTile({
  tone,
  label,
  value,
  delta,
  deltaTone = "teal",
  note,
}: {
  /** Which pastel the tile is filled with. A union rather than a class string,
   * so an off-palette color cannot be passed in. */
  tone: PastelTone;
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "teal" | "amber";
  note: string;
}) {
  return (
    <div className={`rounded-[20px] p-5 ${PASTEL_CLASS[tone]}`}>
      <p className="text-xs text-body-muted">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {delta && <span className={`text-xs font-medium ${deltaTone === "teal" ? "text-teal" : "text-amber"}`}>{delta}</span>}
      </div>
      <p className="mt-1 text-xs text-body-muted">{note}</p>
    </div>
  );
}

/** The four preparation phases as one bar; today's phase is the solid ink pill, like today in the week strip. */
export function PhaseTrack({ phase }: { phase: PhaseInfo }) {
  const w = phase.windows;
  const total = w.length ? w.reduce((a, x) => a + (Date.parse(x.endKey) - Date.parse(x.startKey)), 0) : 0;
  return (
    <div>
      <ol className="flex gap-1" aria-label="Preparation phases">
        {(w.length ? w : [1, 2, 3, 4].map((p) => ({ phase: p, startKey: "", endKey: "" }))).map((x) => {
          const share = total ? (Date.parse(x.endKey) - Date.parse(x.startKey)) / total : 0.25;
          const current = x.phase === phase.phase;
          return (
            <li key={x.phase} style={{ flexGrow: share, flexBasis: 0 }} aria-current={current ? "step" : undefined} className="min-w-0">
              <div className={`flex h-7 items-center justify-center rounded-full text-xs ${current ? "bg-ink text-white" : "bg-control text-ink-soft"}`}>{x.phase}</div>
              {x.startKey && <p className="mt-1 truncate text-center text-[11px] text-slate">{formatDayShort(x.startKey)}</p>}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm font-semibold">{phase.label}</p>
      <p className="mt-0.5 text-xs text-slate">{phase.focus}</p>
      {phase.assumed && <p className="mt-2 text-xs text-amber">Phase 1 is assumed until you set an exam date.</p>}
    </div>
  );
}

/**
 * Exam-week strip (DESIGN.md §5): a 7-day row with today as a solid ink
 * circle. Server-rendered from the plan's own day keys so it can never
 * disagree with "N days to exam" above it.
 */
export function WeekStrip({ days }: { days: { key: string; weekday: string; dayOfMonth: string; isToday: boolean }[] }) {
  if (!days.length) return null;
  return (
    <ol className="mt-3 flex items-center justify-between" aria-label="This week">
      {days.map((d) => (
        <li key={d.key} className="flex flex-col items-center gap-1">
          <span className="text-xs text-slate">{d.weekday}</span>
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs tabular-nums ${
              d.isToday ? "bg-ink text-white" : "text-ink"
            }`}
            aria-current={d.isToday ? "date" : undefined}
          >
            {d.dayOfMonth}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ReasonRows({ rows }: { rows: { text: string; value: string; tone: "amber" | "teal" }[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center justify-between gap-4 py-3">
          <span className="text-sm">{r.text}</span>
          <span className={`shrink-0 text-xs ${r.tone === "amber" ? "text-amber" : "text-teal"}`}>{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
