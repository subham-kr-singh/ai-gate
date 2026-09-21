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
}: {
  options: Option[];
  type: "MCQ" | "MSQ";
  selected: string | string[] | null;
  onChange: (next: string | string[]) => void;
}) {
  const selectedSet = new Set(Array.isArray(selected) ? selected : selected ? [selected] : []);

  function toggle(id: string) {
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
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            className={cn(
              "text-left rounded-card border px-4 py-3 text-sm transition-colors",
              isSelected ? "border-ink bg-control" : "border-line bg-white hover:bg-control/60"
            )}
          >
            {opt.text}
          </button>
        );
      })}
    </div>
  );
}
