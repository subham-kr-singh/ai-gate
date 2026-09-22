"use client";

import { useState } from "react";
import { focusRing, pillDark } from "./ui";
import { useDelayedRefresh } from "@/lib/use-delayed-refresh";

export interface PlanSettings {
  examDate: string | null;
  prepStartDate: string;
  timezone: string;
  targetDaysPerUnit: number;
  maxExtensionDays: number;
}

const field = `h-10 w-full rounded-full bg-[#ECE9E3] px-4 text-sm outline-none ${focusRing}`;

export function PlanSettingsForm({ initial }: { initial: PlanSettings }) {
  const refreshSoon = useDelayedRefresh();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/planner/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examDate: s.examDate || null,
          prepStartDate: s.prepStartDate,
          targetDaysPerUnit: s.targetDaysPerUnit,
          maxExtensionDays: s.maxExtensionDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const first = data.issues?.[0]?.message;
        setMsg({ tone: "error", text: first ?? data.error ?? "That did not save." });
        return;
      }
      setMsg({ tone: "ok", text: "Plan saved." });
      refreshSoon();
    } catch {
      setMsg({ tone: "error", text: "You appear to be offline. Try again when you are back online." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs text-[#77736D]">
        Exam date
        <input type="date" className={field} value={s.examDate ?? ""} onChange={(e) => setS({ ...s, examDate: e.target.value || null })} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[#77736D]">
        Preparation started on
        <input type="date" required className={field} value={s.prepStartDate} onChange={(e) => setS({ ...s, prepStartDate: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-[#77736D]">
          Days per unit (soft target)
          <input type="number" min={0.5} max={5} step={0.25} className={field} value={s.targetDaysPerUnit} onChange={(e) => setS({ ...s, targetDaysPerUnit: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#77736D]">
          Extra days allowed
          <input type="number" min={0} max={7} step={0.5} className={field} value={s.maxExtensionDays} onChange={(e) => setS({ ...s, maxExtensionDays: Number(e.target.value) })} />
        </label>
      </div>
      <button type="submit" className={pillDark} disabled={busy}>
        Save plan
      </button>
      <p role="status" aria-live="polite" className={`min-h-4 text-xs ${msg?.tone === "error" ? "text-[#D98E2B]" : "text-[#77736D]"}`}>
        {msg?.text}
      </p>
    </form>
  );
}
