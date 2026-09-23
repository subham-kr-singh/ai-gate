import { palette } from "@/lib/design-tokens";
import type { ConceptGateItem } from "@/server/domains/mastery/mastery.queries";

const LOCK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={palette.slate} strokeWidth="2" aria-hidden="true">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/** Concepts of one unit. A lock means a prerequisite is below its threshold, and says which. */
export function ConceptGateList({ title, items, gateAt }: { title: string; items: ConceptGateItem[]; gateAt: number }) {
  return (
    <div className="rounded-[20px] border border-line p-5">
      <p className="mb-3 font-semibold text-ink">{title}</p>
      <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
        {items.map((c) => (
          <li key={c.conceptId} className={`flex items-center justify-between gap-3 py-3 ${c.state === "LOCKED" ? "opacity-60" : ""}`}>
            <span className="flex items-center gap-2 text-sm text-ink">
              {c.state === "LOCKED" && LOCK}
              {c.name}
            </span>
            {c.state === "MASTERED" && <span className="text-xs text-teal">Mastered</span>}
            {c.state === "IN_PROGRESS" && <span className="text-xs text-amber">In progress, {Math.round((c.mastery ?? 0) * 100)}%</span>}
            {c.state === "NOT_STARTED" && <span className="text-xs text-slate">Not started</span>}
            {c.state === "LOCKED" && (
              <span className="text-xs text-slate">Needs {c.blockedBy ?? "a prerequisite"} &ge; {Math.round(gateAt * 100)}%</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
