"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface Props<T> {
  /** Currently selected value; `null` is the "all" option. */
  value: T | null;
  options: { value: T; label: string; hint?: string }[];
  allLabel: string;
  onChange: (value: T | null) => void;
  /** Rendered on the trigger, e.g. the selected option's name. */
  label: ReactNode;
  srLabel: string;
}

/**
 * Keyboard-complete listbox for the dashboard's subject filter. Built rather
 * than pulled from a library so it inherits the design tokens directly and
 * ships no extra JS. Closes on outside pointer, Escape, and blur-to-outside.
 */
export function FilterDropdown<T extends string>({
  value,
  options,
  allLabel,
  onChange,
  label,
  srLabel,
}: Props<T>): ReactNode {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Entries are "all" first, then the options, so index 0 means "no filter".
  const entries: { value: T | null; label: string; hint?: string }[] = [
    { value: null, label: allLabel },
    ...options,
  ];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) setActive(-1);
    else setActive(entries.findIndex((e) => e.value === value));
    // entries is rebuilt each render; only reopen/close and value should refocus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  const commit = (v: T | null) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => {
        const next = i < 0 ? (dir === 1 ? 0 : entries.length - 1) : i + dir;
        return Math.max(0, Math.min(entries.length - 1, next));
      });
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      const entry = entries[active < 0 ? 0 : active];
      if (entry) commit(entry.value);
    }
  };

  const filtered = value !== null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={srLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm ${
          filtered ? "bg-[#111111] text-white" : "bg-[#ECE9E3] text-[#111111]"
        }`}
      >
        <span className="max-w-[11rem] truncate">{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={srLabel}
          className="absolute left-0 top-12 z-20 m-0 max-h-72 w-56 list-none overflow-y-auto rounded-[16px] border border-[#E3E0DA] bg-white p-1"
        >
          {entries.map((entry, i) => {
            const selected = entry.value === value;
            return (
              <li key={entry.value ?? "__all"} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => commit(entry.value)}
                  className={`flex w-full items-center justify-between gap-2 rounded-[12px] px-3 py-2 text-left text-sm ${
                    i === active ? "bg-[#ECE9E3]" : ""
                  } ${selected ? "font-medium text-[#111111]" : "text-[#3a3a3a]"}`}
                >
                  <span className="truncate">{entry.label}</span>
                  {entry.hint && <span className="shrink-0 text-xs text-[#77736D]">{entry.hint}</span>}
                  {selected && <span className="sr-only">(selected)</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
