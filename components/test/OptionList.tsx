"use client";

import { cn } from "@/lib/cn";

interface Option {
  id: string;
  text: string;
}

export function OptionList({
  options,
  type,
  selected,
  onChange,
  disabled = false,
  reveal,
}: {
  options: Option[];
  type: "MCQ" | "MSQ";
  selected: string | string[] | null;
  onChange: (next: string | string[]) => void;
  disabled?: boolean;
  /** Correct option ids, shown once the question is settled. */
  reveal?: string[];
}) {
  const selectedSet = new Set(Array.isArray(selected) ? selected : selected ? [selected] : []);
  const revealSet = new Set(reveal ?? []);

  function toggle(id: string) {
    if (disabled) return;
    if (type === "MCQ") {
      onChange(id);
      return;
    }
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => {
        const isSelected = selectedSet.has(opt.id);
        const isCorrect = revealSet.has(opt.id);
        const state = reveal
          ? isCorrect
            ? "border-teal bg-teal/5"
            : isSelected
              ? "border-amber bg-amber/5"
              : "border-line bg-white"
          : isSelected
            ? "border-ink bg-control"
            : "border-line bg-white hover:bg-control/60";
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            disabled={disabled}
            aria-disabled={disabled}
            className={cn(
              "text-left rounded-card border px-4 py-3 text-sm transition-colors disabled:cursor-default",
              state
            )}
          >
            {opt.text}
            {reveal && isCorrect && <span className="ml-2 text-xs text-teal">correct</span>}
          </button>
        );
      })}
    </div>
  );
}
