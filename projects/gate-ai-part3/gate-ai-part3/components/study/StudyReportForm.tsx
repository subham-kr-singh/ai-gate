"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { STATUS_LABELS, type UnitStatusValue } from "@/lib/status";
import { ui } from "@/lib/ui-tokens";

interface UnitOption {
  unitId: string;
  unit: string;
  subject: string;
  topics: { id: string; name: string }[];
}

const STATUSES: UnitStatusValue[] = ["LEARNING", "PRACTICING", "PROVISIONALLY_COMPLETE", "MASTERED"];
const CONFIDENCE = [
  { v: 1, label: "Guessing" },
  { v: 2, label: "Low" },
  { v: 3, label: "Fairly sure" },
  { v: 4, label: "Very sure" },
];

const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

export function StudyReportForm({ units }: { units: UnitOption[] }) {
  // One id per form mount: retrying a failed submit can never count twice.
  const requestId = useRef<string>(typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now()) + Math.random());

  const [unitId, setUnitId] = useState("");
  const [status, setStatus] = useState<UnitStatusValue>("PRACTICING");
  const [covered, setCovered] = useState<Set<string>>(new Set());
  const [weak, setWeak] = useState<Set<string>>(new Set());
  const [qa, setQa] = useState("");
  const [qc, setQc] = useState("");
  const [pa, setPa] = useState("");
  const [pc, setPc] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [cont, setCont] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ status?: string; decision?: string } | null>(null);

  const unit = units.find((u) => u.unitId === unitId);
  const bySubject = useMemo(() => {
    const m = new Map<string, UnitOption[]>();
    for (const u of units) m.set(u.subject, [...(m.get(u.subject) ?? []), u]);
    return [...m.entries()];
  }, [units]);

  const toggle = (set: Set<string>, id: string, write: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    write(next);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!unitId) return setError("Choose the unit you studied.");
    if (num(qc) > num(qa)) return setError("Correct answers cannot be more than questions attempted.");
    if (num(pc) > num(pa)) return setError("Correct PYQs cannot be more than PYQs attempted.");

    setBusy(true);
    try {
      const res = await fetch("/api/study-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: requestId.current,
          unitId,
          status,
          topicsCoveredIds: [...covered],
          weakTopicIds: [...weak],
          questionsAttempted: num(qa),
          questionsCorrect: num(qc),
          pyqAttempted: num(pa),
          pyqCorrect: num(pc),
          selfConfidence: confidence,
          continueUnit: cont,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.issues?.[0]?.message ?? data?.error ?? "Could not save the report. Try again.");
        return;
      }
      setDone({ status: data.status, decision: data.decision });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className={`${ui.card} max-w-xl p-6`} aria-live="polite">
        <h2 className="font-semibold text-[#111111]">Study session saved</h2>
        <p className="mt-2 text-sm text-[#3a3a3a]">
          {unit?.unit ?? "This unit"} is now {done.status ? STATUS_LABELS[done.status as UnitStatusValue].toLowerCase() : "updated"}.
          {done.decision === "CONTINUE" ? " The evidence says to keep working on it." : " The evidence supports moving on, with revision scheduled."}
        </p>
        <div className="mt-4 flex gap-3">
          <Link href="/dashboard" className={ui.btn}>Back to today</Link>
          <button type="button" className={ui.btnQuiet} onClick={() => window.location.reload()}>Log another session</button>
        </div>
      </section>
    );
  }

  const label = "mb-1 block text-sm text-[#111111]";
  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className={label}>Unit</span>
          <select
            value={unitId}
            onChange={(e) => { setUnitId(e.target.value); setCovered(new Set()); setWeak(new Set()); }}
            className={`${ui.field} w-full`}
            required
          >
            <option value="">Choose a unit</option>
            {bySubject.map(([subject, list]) => (
              <optgroup key={subject} label={subject}>
                {list.map((u) => (<option key={u.unitId} value={u.unitId}>{u.unit}</option>))}
              </optgroup>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className={label}>Where does this unit stand?</legend>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
                className={`h-9 rounded-full px-4 text-sm ${status === s ? ui.segOn : ui.segOff}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {unit && (
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className={`${ui.card} p-4`}>
            <legend className="px-1 text-sm font-semibold text-[#111111]">Topics you covered</legend>
            {unit.topics.map((t) => (
              <label key={t.id} className="flex items-center gap-2 py-1 text-sm text-[#111111]">
                <input type="checkbox" checked={covered.has(t.id)} onChange={() => toggle(covered, t.id, setCovered)} />
                {t.name}
              </label>
            ))}
          </fieldset>
          <fieldset className={`${ui.card} p-4`}>
            <legend className="px-1 text-sm font-semibold text-[#111111]">Topics that felt weak</legend>
            {unit.topics.map((t) => (
              <label key={t.id} className="flex items-center gap-2 py-1 text-sm text-[#111111]">
                <input type="checkbox" checked={weak.has(t.id)} onChange={() => toggle(weak, t.id, setWeak)} />
                {t.name}
              </label>
            ))}
          </fieldset>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {([["Questions attempted", qa, setQa], ["Questions correct", qc, setQc], ["PYQs attempted", pa, setPa], ["PYQs correct", pc, setPc]] as const).map(([l, v, set]) => (
          <label key={l} className="text-sm">
            <span className={label}>{l}</span>
            <input type="number" min={0} inputMode="numeric" value={v} onChange={(e) => set(e.target.value)} className={`${ui.field} w-full`} placeholder="0" />
          </label>
        ))}
      </div>

      <fieldset>
        <legend className={label}>How confident do you feel about this unit?</legend>
        <div className="flex flex-wrap gap-2">
          {CONFIDENCE.map((c) => (
            <button key={c.v} type="button" aria-pressed={confidence === c.v} onClick={() => setConfidence(confidence === c.v ? null : c.v)}
              className={`h-9 rounded-full px-4 text-sm ${confidence === c.v ? ui.segOn : ui.segOff}`}>
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-[#111111]">
        <input type="checkbox" checked={cont} onChange={(e) => setCont(e.target.checked)} />
        I want to keep working on this unit
      </label>

      <label className="text-sm">
        <span className={label}>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000}
          className="w-full rounded-[20px] bg-[#ECE9E3] p-4 text-sm text-[#111111] outline-none placeholder-[#9B968E]" placeholder="What was hard? What confused you?" />
      </label>

      {error && <p role="alert" className="text-sm text-[#D98E2B]">{error}</p>}
      <div>
        <button type="submit" disabled={busy} className={ui.btn}>{busy ? "Saving..." : "Save study session"}</button>
      </div>
    </form>
  );
}
