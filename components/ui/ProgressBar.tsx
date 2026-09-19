import { cn } from "@/lib/cn";

interface ProgressBarProps {
  value: number; // 0-100
  tone?: "teal" | "amber";
  label?: string;
  className?: string;
}

export function ProgressBar({ value, tone = "teal", label, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="text-fog">{label}</span>
          <span className="font-display font-semibold text-fog">{clamped}%</span>
        </div>
      )}
      <div className="h-1.5 w-full bg-slate/25">
        <div
          className={cn("h-full", tone === "teal" ? "bg-teal" : "bg-amber")}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
