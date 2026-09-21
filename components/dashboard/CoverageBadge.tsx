import { STATUS_LABELS, STATUS_TEXT, type UnitStatusValue } from "@/lib/status";

/** Unit status as coloured text (teal = progress, amber = needs attention). */
export function CoverageBadge({ status }: { status: UnitStatusValue }) {
  return <span className={`text-xs font-medium ${STATUS_TEXT[status]}`}>{STATUS_LABELS[status]}</span>;
}
