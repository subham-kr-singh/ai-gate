interface Props {
  /** 0..1 */
  value: number;
  /** Name on the left of a top row, percentage on the right. */
  label?: string;
  /** Text under the bar, e.g. "43% covered". */
  caption?: string;
  tone?: "ink" | "teal";
}

/** Thin rounded progress bar. Fills once on load (animate-fill-w, reduced-motion safe). */
export function MasteryBar({ value, label, caption, tone = "ink" }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink">{label}</span>
          <span className="tabular-nums text-slate">{pct}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label ?? caption ?? "Progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className={`${label ? "mt-1" : "mt-3"} h-1.5 w-full overflow-hidden rounded-full bg-black/10`}
      >
        <div className={`animate-fill-w h-full rounded-full ${tone === "teal" ? "bg-teal" : "bg-ink"}`} style={{ width: `${pct}%` }} />
      </div>
      {caption && <p className="mt-1 text-xs text-slate">{caption}</p>}
    </div>
  );
}
