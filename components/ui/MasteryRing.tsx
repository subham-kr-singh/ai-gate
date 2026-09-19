import { cn } from "@/lib/cn";

interface MasteryRingProps {
  /** 0–100 */
  mastery: number;
  size?: number;
  label?: string;
  className?: string;
}

/**
 * The single bold, animated element in the design system (see
 * DESIGN_SYSTEM.md — "The one bold element"). Teal arc = achieved
 * mastery, amber arc = the remaining gap to target. Fills once on
 * mount; never re-animates on scroll or hover.
 *
 * Deliberately not reused as decoration elsewhere — one ring per
 * screen, on Dashboard and Concept Detail only.
 */
export function MasteryRing({
  mastery,
  size = 96,
  label,
  className,
}: MasteryRingProps) {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, mastery));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex flex-col items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="-rotate-90"
        role="img"
        aria-label={
          label ? `${label}: ${clamped}% mastery` : `${clamped}% mastery`
        }
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--color-slate)"
          strokeOpacity={0.35}
          strokeWidth={8}
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--color-teal)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={
            {
              "--ring-circumference": circumference,
              "--ring-offset": offset,
              strokeDashoffset: circumference,
            } as React.CSSProperties
          }
          className="animate-ring-fill"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-semibold text-fog">
          {clamped}%
        </span>
        {label && <span className="text-[11px] text-slate">{label}</span>}
      </div>
    </div>
  );
}
