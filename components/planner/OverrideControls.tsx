"use client";

import { useState } from "react";
import { focusRing, pillDark, pillSoft } from "./ui";
import { useDelayedRefresh } from "@/lib/use-delayed-refresh";

interface UnitOption {
  unitId: string;
  unitName: string;
  subjectName: string;
}

const field = `h-10 w-full rounded-full bg-[#ECE9E3] px-4 text-sm outline-none placeholder:text-[#9B968E] ${focusRing}`;

export function OverrideControls({
  decisionId,
  recommendedUnitId,
  recommendedUnitName,
  units,
}: {
  decisionId: string | null;
  recommendedUnitId: string | null;
  recommendedUnitName: string | null;
  units: UnitOption[];
}) {
  const refreshSoon = useDelayedRefresh();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [chosen, setChosen] = useState("");
  const [reason, setReason] = useState("");
  const [moveOn, setMoveOn] = useState(false);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/planner/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId: decisionId ?? undefined, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ tone: "error", text: data.error ?? "That did not save. Try again." });
        return;
      }
      setMessage({ tone: "ok", text: (data.effects as string[])?.join(" ") || "Saved." });
      setOpen(false);
      refreshSoon();
    } catch {
      setMessage({ tone: "error", text: "You appear to be offline. Try again when you are back online." });
    } finally {
      setBusy(false);
    }
  }

  const bySubject = units.reduce<Record<string, UnitOption[]>>((acc, u) => {
    (acc[u.subjectName] ??= []).push(u);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={pillSoft} disabled={busy} onClick={() => send({ choice: "SKIP" })}>
          Skip today
        </button>
        <button type="button" className={pillSoft} disabled={busy} onClick={() => send({ choice: "SNOOZE", snoozeDays: 3 })}>
          Snooze 3 days
        </button>
        <button type="button" className={pillSoft} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Work on something else
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 rounded-[20px] border border-[#E3E0DA] p-4">
          <label className="flex flex-col gap-1 text-xs text-[#77736D]">
            Unit to work on instead
            <select className={field} value={chosen} onChange={(e) => setChosen(e.target.value)}>
              <option value="">Choose a unit</option>
              {Object.entries(bySubject).map(([subject, list]) => (
                <optgroup key={subject} label={subject}>
                  {list.map((u) => (
                    <option key={u.unitId} value={u.unitId}>
                      {u.unitName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#77736D]">
            Why (optional)
            <input className={field} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="I want to finish this first" />
          </label>
          {recommendedUnitId && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={moveOn} onChange={(e) => setMoveOn(e.target.checked)} />
              <span>
                Move on from {recommendedUnitName ?? "this unit"} and keep its weak concepts on my revision list
              </span>
            </label>
          )}
          <button
            type="button"
            className={pillDark}
            disabled={busy || !chosen}
            onClick={() => send({ choice: "OVERRIDE", chosenUnitId: chosen, reason: reason || undefined, moveOn: moveOn || undefined })}
          >
            Switch to this unit
          </button>
        </div>
      )}

      <p role="status" aria-live="polite" className={`min-h-4 text-xs ${message?.tone === "error" ? "text-[#D98E2B]" : "text-[#77736D]"}`}>
        {message?.text}
      </p>
    </div>
  );
}
