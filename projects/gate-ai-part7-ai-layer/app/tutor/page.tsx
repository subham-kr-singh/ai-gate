"use client";

import { useState } from "react";

/**
 * app/tutor/page.tsx
 *
 * Chatbot UI. Two-step flow, matching the architecture's non-negotiable
 * separation:
 *
 *   1. User describes their session in free text -> POST /api/chat
 *      -> server extracts a StudyReportDraft (advisory only).
 *   2. Draft is rendered as an EDITABLE form (same shape as Part 3's
 *      manual Quick Study Report). User reviews/edits/confirms.
 *   3. Only on confirm does the client POST the (possibly edited) form
 *      to /api/study-reports — the Part 3 endpoint that actually updates
 *      ConceptStats/mastery. This route never calls that endpoint itself.
 */

type StudyReportDraft = {
  subjectRaw: string;
  unitRaw: string;
  status:
    | "not_started"
    | "learning"
    | "practicing"
    | "provisionally_complete"
    | "mastered";
  topicsCovered: string[];
  weakTopics: string[];
  questionsAttempted: number | null;
  questionsCorrect: number | null;
  pyqsAttempted: number | null;
  pyqsCorrect: number | null;
  selfConfidence: "low" | "medium" | "high" | null;
  continueUnit: boolean;
  notes: string | null;
  extractionConfidence: number;
  ambiguousFields: string[];
};

type ChatResponse =
  | { kind: "draft"; draft: StudyReportDraft }
  | { kind: "unavailable"; reason: string };

const STATUS_OPTIONS: StudyReportDraft["status"][] = [
  "not_started",
  "learning",
  "practicing",
  "provisionally_complete",
  "mastered",
];

export default function TutorPage() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<StudyReportDraft | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(
    null
  );
  const [confirmState, setConfirmState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  async function handleSend() {
    if (!message.trim()) return;
    setLoading(true);
    setDraft(null);
    setUnavailableReason(null);
    setConfirmState("idle");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, knownSubjects: [] }),
      });
      const data: ChatResponse = await res.json();
      if (data.kind === "draft") {
        setDraft(data.draft);
      } else {
        setUnavailableReason(data.reason);
      }
    } catch {
      setUnavailableReason(
        "Couldn't reach the extraction service. Use the manual Quick Study Report form instead."
      );
    } finally {
      setLoading(false);
    }
  }

  function updateDraft<K extends keyof StudyReportDraft>(
    key: K,
    value: StudyReportDraft[K]
  ) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function handleConfirm() {
    if (!draft) return;
    setConfirmState("saving");
    try {
      const res = await fetch("/api/study-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("save failed");
      setConfirmState("saved");
    } catch {
      setConfirmState("error");
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-[#111111]">Tutor</h1>
        <p className="text-sm text-[#77736D] mt-1">
          Describe what you studied in your own words. I'll draft a study
          report — you review and confirm it before anything updates your
          progress.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          className="w-full rounded-[16px] border border-[#E3E0DA] p-3 text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-[#0E8074]"
          placeholder='e.g. "Finished OS Unit 2 but page replacement is confusing. Got 9/15 questions right, still mixing up FIFO and LRU."'
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button
          className="self-end h-10 px-5 rounded-full bg-[#111111] text-white text-sm disabled:opacity-50"
          onClick={handleSend}
          disabled={loading || !message.trim()}
        >
          {loading ? "Extracting…" : "Send"}
        </button>
      </div>

      {unavailableReason && (
        <div className="rounded-[16px] border border-[#D98E2B] bg-[#F4DEB4]/40 p-4 text-sm text-[#111111]">
          {unavailableReason}
        </div>
      )}

      {draft && (
        <div className="rounded-[20px] border border-[#E3E0DA] p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-[#111111]">Study report draft</p>
            <span className="text-xs text-[#77736D]">
              Extraction confidence: {Math.round(draft.extractionConfidence * 100)}%
            </span>
          </div>

          {draft.ambiguousFields.length > 0 && (
            <p className="text-xs text-[#D98E2B]">
              Please check: {draft.ambiguousFields.join(", ")}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Subject">
              <input
                className="input"
                value={draft.subjectRaw}
                onChange={(e) => updateDraft("subjectRaw", e.target.value)}
              />
            </Field>
            <Field label="Unit">
              <input
                className="input"
                value={draft.unitRaw}
                onChange={(e) => updateDraft("unitRaw", e.target.value)}
              />
            </Field>
            <Field label="Status">
              <select
                className="input"
                value={draft.status}
                onChange={(e) =>
                  updateDraft(
                    "status",
                    e.target.value as StudyReportDraft["status"]
                  )
                }
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Continue unit?">
              <select
                className="input"
                value={draft.continueUnit ? "yes" : "no"}
                onChange={(e) =>
                  updateDraft("continueUnit", e.target.value === "yes")
                }
              >
                <option value="yes">Yes</option>
                <option value="no">No, moving on</option>
              </select>
            </Field>
            <Field label="Questions attempted">
              <input
                className="input"
                type="number"
                value={draft.questionsAttempted ?? ""}
                onChange={(e) =>
                  updateDraft(
                    "questionsAttempted",
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
              />
            </Field>
            <Field label="Questions correct">
              <input
                className="input"
                type="number"
                value={draft.questionsCorrect ?? ""}
                onChange={(e) =>
                  updateDraft(
                    "questionsCorrect",
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
              />
            </Field>
          </div>

          <Field label="Weak topics">
            <input
              className="input"
              value={draft.weakTopics.join(", ")}
              onChange={(e) =>
                updateDraft(
                  "weakTopics",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                )
              }
            />
          </Field>

          <Field label="Notes">
            <textarea
              className="input min-h-[60px]"
              value={draft.notes ?? ""}
              onChange={(e) => updateDraft("notes", e.target.value)}
            />
          </Field>

          <button
            className="self-start h-10 px-5 rounded-full bg-[#0E8074] text-white text-sm disabled:opacity-50"
            onClick={handleConfirm}
            disabled={confirmState === "saving" || confirmState === "saved"}
          >
            {confirmState === "saving"
              ? "Saving…"
              : confirmState === "saved"
              ? "Saved"
              : "Confirm & update progress"}
          </button>
          {confirmState === "error" && (
            <p className="text-xs text-red-600">
              Couldn't save — try the manual Quick Study Report form.
            </p>
          )}
        </div>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 10px;
          border: 1px solid #e3e0da;
          padding: 8px 10px;
          font-size: 14px;
          outline: none;
        }
        .input:focus {
          box-shadow: 0 0 0 2px #0e8074;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[#77736D]">
      {label}
      {children}
    </label>
  );
}
