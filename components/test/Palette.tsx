"use client";

import { cn } from "@/lib/cn";

export type PaletteStatus = "unanswered" | "answered" | "marked" | "answered-marked";

export function Palette({
  questions,
  currentIndex,
  statuses,
  onSelect,
}: {
  questions: { id: string }[];
  currentIndex: number;
  statuses: Record<string, PaletteStatus>;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {questions.map((q, i) => {
        const status = statuses[q.id] ?? "unanswered";
        const isCurrent = i === currentIndex;
        return (
          <button
            key={q.id}
            type="button"
            onClick={() => onSelect(i)}
            className={cn(
              "h-9 w-9 rounded-full text-xs font-medium flex items-center justify-center border",
              isCurrent && "ring-2 ring-ink",
              status === "unanswered" && "bg-control text-ink-soft border-line",
              status === "answered" && "bg-teal text-white border-teal",
              status === "marked" && "bg-amber text-white border-amber",
              status === "answered-marked" && "bg-amber text-white border-teal"
            )}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
