"use client";

import { useState } from "react";
import { focusRing, pillDark } from "../planner/ui";
import { useDelayedRefresh } from "@/lib/use-delayed-refresh";

const KINDS = [
  ["DEFINITION", "Definition"],
  ["FORMULA", "Formula"],
  ["ALGORITHM", "Algorithm"],
  ["TRAP", "Common trap"],
  ["COMPARISON", "Comparison"],
  ["MISTAKE", "From a mistake"],
] as const;

const field = `w-full rounded-[20px] bg-[#ECE9E3] px-4 py-3 text-sm outline-none placeholder:text-[#9B968E] ${focusRing}`;

export function NewFlashcardForm() {
  const refreshSoon = useDelayedRefresh();
  const [kind, setKind] = useState("DEFINITION");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, front, back }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ tone: "error", text: data.issues?.[0]?.message ?? data.error ?? "That card did not save." });
        return;
      }
      setFront("");
      setBack("");
      setMsg({ tone: "ok", text: "Card added. It is due now." });
      refreshSoon();
    } catch {
      setMsg({ tone: "error", text: "You appear to be offline. Try again when you are back online." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs text-[#77736D]">
        Type
        <select className={`h-10 rounded-full bg-[#ECE9E3] px-4 text-sm text-[#111111] outline-none ${focusRing}`} value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-[#77736D]">
        Question
        <textarea className={field} rows={3} value={front} onChange={(e) => setFront(e.target.value)} placeholder="When does LRU differ from FIFO?" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[#77736D]">
        Answer
        <textarea className={field} rows={3} value={back} onChange={(e) => setBack(e.target.value)} placeholder="LRU evicts the page unused longest; FIFO evicts the oldest loaded." />
      </label>
      <button type="submit" className={pillDark} disabled={busy || !front.trim() || !back.trim()}>
        Add card
      </button>
      <p role="status" aria-live="polite" className={`min-h-4 text-xs ${msg?.tone === "error" ? "text-[#D98E2B]" : "text-[#77736D]"}`}>
        {msg?.text}
      </p>
    </form>
  );
}
