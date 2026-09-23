import { cn } from "@/lib/cn";

const TONE_CLASS = { ink: "bg-ink", teal: "bg-teal", amber: "bg-amber" } as const;

/**
 * The single progress bar for the app. `value` is a 0–1 fraction (call sites
 * pass coverage ratios, not percentages). `label` is required: a bar always
 * carries a value, so it should never be invisible to assistive tech.
 */
export function ProgressBar({
  value,
  tone = "ink",
  label,
  className,
}: {
  value: number;
  tone?: keyof typeof TONE_CLASS;
  label: string;
  className?: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-black/10", className)}
    >
      <div
        className={cn("h-full rounded-full animate-fill-w", TONE_CLASS[tone])}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
