import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Urgency = "due" | "on-track" | "snoozed";

const urgencyColor: Record<Urgency, string> = {
  due: "bg-amber",
  "on-track": "bg-teal",
  snoozed: "bg-slate",
};

interface PriorityBarProps {
  urgency: Urgency;
  children: ReactNode;
  className?: string;
}

/**
 * The "priority spine" device from DESIGN_SYSTEM.md — a 3px colored
 * edge instead of a rounded status pill/badge. Used on Today, Planner,
 * and DPP list rows. Color is semantic only: amber = due/weak,
 * teal = on-track/new, slate = snoozed. Never decorative.
 */
export function PriorityBar({
  urgency,
  children,
  className,
}: PriorityBarProps) {
  return (
    <div
      className={cn("relative border-b border-slate/30 py-3 pl-4", className)}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 h-full w-[3px]",
          urgencyColor[urgency],
        )}
      />
      {children}
    </div>
  );
}
