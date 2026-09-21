import { cn } from "@/lib/cn";

export function ProgressBar({
  percent,
  fillClassName = "bg-ink",
  className,
}: {
  percent: number;
  fillClassName?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-black/10 overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full animate-fill-w", fillClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
