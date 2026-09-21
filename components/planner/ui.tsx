/**
 * Building blocks copied from design.md / dashboard-demo-v3.html. Server-safe
 * (no hooks). Colours are the documented hex values, kept in this one module's
 * class strings so a later port to tailwind.config.ts is a single search.
 */
import type { ReactNode } from "react";
import type { PhaseInfo } from "@/server/domains/planner/planner.types";
import { formatDayShort, subjectBadge } from "./format";
import "./planner.css";

export const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]";
export const pillDark = `inline-flex h-10 items-center justify-center rounded-full bg-[#111111] px-5 text-sm font-medium text-white ${focusRing}`;
export const pillSoft = `inline-flex h-9 items-center justify-center rounded-full bg-[#ECE9E3] px-4 text-sm text-[#222222] hover:bg-[#E3E0DA] ${focusRing}`;
export const cardClass = "rounded-[20px] border border-[#E3E0DA] bg-white";

/** Main workspace plus the 320px insight panel; the nav rail lives in the app layout. */
export function PageShell({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-[#F8F6F2] text-[#111111] lg:grid-cols-[minmax(0,1fr)_320px]">
      <main className="flex flex-col gap-7 p-6 md:p-10 lg:border-r lg:border-[#E3E0DA]">{children}</main>
      <aside className="flex flex-col gap-6 border-t border-[#E3E0DA] p-6 lg:border-t-0">{aside}</aside>
    </div>
  );
}

export function ProgressBar({ value, tone = "ink", label }: { value: number; tone?: "ink" | "teal" | "amber"; label: string }) {
  const w = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const fill = tone === "teal" ? "bg-[#0E8074]" : tone === "amber" ? "bg-[#D98E2B]" : "bg-[#111111]";
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={w} className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
      <div className={`h-full rounded-full animate-fill-w ${fill}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function SubjectBadge({ name, code: forced }: { name: string | null; code?: string }) {
  const badge = subjectBadge(name);
  const code = forced ?? badge.code;
  return (
    <div aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-[#111111] ${badge.fill}`}>
      {code}
    </div>
  );
}

export function StatTile({
  fill,
  label,
  value,
  delta,
  deltaTone = "teal",
  note,
}: {
  fill: string;
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "teal" | "amber";
  note: string;
}) {
  return (
    <div className={`rounded-[20px] p-5 ${fill}`}>
      <p className="text-xs text-[#3a3a3a]">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {delta && <span className={`text-xs font-medium ${deltaTone === "teal" ? "text-[#0E8074]" : "text-[#D98E2B]"}`}>{delta}</span>}
      </div>
      <p className="mt-1 text-xs text-[#3a3a3a]">{note}</p>
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
              <div className={`flex h-7 items-center justify-center rounded-full text-xs ${current ? "bg-[#111111] text-white" : "bg-[#ECE9E3] text-[#222222]"}`}>{x.phase}</div>
              {x.startKey && <p className="mt-1 truncate text-center text-[11px] text-[#77736D]">{formatDayShort(x.startKey)}</p>}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm font-semibold">{phase.label}</p>
      <p className="mt-0.5 text-xs text-[#77736D]">{phase.focus}</p>
      {phase.assumed && <p className="mt-2 text-xs text-[#D98E2B]">Phase 1 is assumed until you set an exam date.</p>}
    </div>
  );
}

export function ReasonRows({ rows }: { rows: { text: string; value: string; tone: "amber" | "teal" }[] }) {
  return (
    <ul className="flex flex-col divide-y divide-[#E3E0DA]">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center justify-between gap-4 py-3">
          <span className="text-sm">{r.text}</span>
          <span className={`shrink-0 text-xs ${r.tone === "amber" ? "text-[#D98E2B]" : "text-[#0E8074]"}`}>{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
