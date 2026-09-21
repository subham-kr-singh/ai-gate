"use client";

import { formatDistanceStrict } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { focusRing, pillDark } from "../planner/ui";

export interface ReviewCard {
  id: string;
  kind: string;
  front: string;
  back: string;
  isNew: boolean;
  previews: Record<"again" | "hard" | "good" | "easy", string>;
}

const GRADES = [
  { key: "again", label: "Again", hotkey: "1" },
  { key: "hard", label: "Hard", hotkey: "2" },
  { key: "good", label: "Good", hotkey: "3" },
  { key: "easy", label: "Easy", hotkey: "4" },
] as const;

const KIND: Record<string, string> = {
  FORMULA: "Formula",
  DEFINITION: "Definition",
  ALGORITHM: "Algorithm",
  TRAP: "Common trap",
  COMPARISON: "Comparison",
  MISTAKE: "From a mistake",
};

export function FlashcardReviewer({ cards }: { cards: ReviewCard[] }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const revealRef = useRef<HTMLButtonElement>(null);
  const card = cards[i];

  const grade = useCallback(
    async (g: (typeof GRADES)[number]["key"]) => {
      if (!card || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/flashcards/${card.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grade: g }),
        });
        if (!res.ok) {
          setError("That answer did not save. Check your connection and try again.");
          return;
        }
        setShown(false);
        setI((n) => n + 1);
      } catch {
        setError("You appear to be offline. Try again when you are back online.");
      } finally {
        setBusy(false);
      }
    },
    [card, busy],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (!shown && (e.key === " " || e.key === "Enter") && card) {
        e.preventDefault();
        setShown(true);
      } else if (shown) {
        const g = GRADES.find((x) => x.hotkey === e.key);
        if (g) void grade(g.key);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, card, grade]);

  if (!card) {
    return (
      <div className="rounded-[24px] border border-[#E3E0DA] bg-white p-8">
        <h2 className="text-lg font-semibold">{cards.length ? `You reviewed ${cards.length} ${cards.length === 1 ? "card" : "cards"}.` : "No reviews due right now."}</h2>
        <p className="mt-2 max-w-md text-sm text-[#77736D]">
          {cards.length ? "Each one is scheduled for its next review. Come back when more are due." : "Add cards for formulas, traps and confusing pairs, and they will show up here when they are due."}
        </p>
        <Link href="/planner" className={`${pillDark} mt-5`}>
          Back to Today
        </Link>
      </div>
    );
  }

  return (
    <section aria-label="Flashcard review" className="flex flex-col gap-5">
      <div className="rounded-[24px] border border-[#E3E0DA] bg-white p-7 md:p-10">
        <div className="flex items-center justify-between text-xs text-[#77736D]">
          <span>{KIND[card.kind] ?? card.kind}</span>
          <span className="tabular-nums">
            {i + 1} of {cards.length}
          </span>
        </div>
        <p className="mt-5 whitespace-pre-wrap text-xl font-semibold leading-snug">{card.front}</p>
        {shown ? (
          <p className="mt-6 whitespace-pre-wrap border-t border-[#E3E0DA] pt-6 text-base leading-relaxed">{card.back}</p>
        ) : (
          <button ref={revealRef} type="button" onClick={() => setShown(true)} className={`${pillDark} mt-8`}>
            Show answer
          </button>
        )}
      </div>

      {shown && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {GRADES.map((g) => (
            <button
              key={g.key}
              type="button"
              disabled={busy}
              onClick={() => grade(g.key)}
              className={`flex flex-col items-center rounded-[20px] border border-[#E3E0DA] bg-white px-3 py-3 text-sm hover:bg-[#ECE9E3] ${focusRing}`}
            >
              <span className="font-medium">{g.label}</span>
              <span className="text-xs text-[#77736D]">{formatDistanceStrict(new Date(card.previews[g.key]), now)}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-[#77736D]">Space shows the answer. Keys 1 to 4 rate it.</p>
      <p role="alert" className="min-h-4 text-xs text-[#D98E2B]">
        {error}
      </p>
    </section>
  );
}
