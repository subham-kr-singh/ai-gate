"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ui } from "@/lib/ui-tokens";

/**
 * app/tutor/page.tsx
 *
 * Two ways to talk to the tutor, both honouring the architecture's rule that
 * the chatbot never writes learning state on its own:
 *
 *   Chat    — POST /api/tutor. Answers are grounded in the student's own
 *             numbers plus passages fetched from the internet (cited). When
 *             the student flags low confidence or asks for a plan change, the
 *             reply carries a PROPOSAL that the student confirms below.
 *   Session — the original extract-then-edit flow: POST /api/chat turns free
 *             text into an editable StudyReportDraft, and only an explicit
 *             "Confirm" posts it to /api/study-reports.
 *
 * Nothing on this page mutates progress directly.
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

type Citation = {
  title: string;
  section: string | null;
  url: string;
  site: string;
  reliability: string;
  snippet: string;
};

type Proposal = {
  id: string;
  kind: string;
  unitId: string;
  title: string;
  detail: string;
  confirmLabel: string;
  effects: string[];
  extendDays?: number;
  snoozeDays?: number;
};

type TutorReply = {
  answer: string;
  citations: Citation[];
  proposal: Proposal | null;
  degraded: boolean;
};

type Turn =
  | { role: "student"; text: string }
  | { role: "tutor"; reply: TutorReply }
  | { role: "notice"; text: string };

const STATUS_OPTIONS: StudyReportDraft["status"][] = [
  "not_started",
  "learning",
  "practicing",
  "provisionally_complete",
  "mastered",
];

const STARTERS = [
  "How am I doing overall?",
  "I feel low confidence on this unit — what should I do?",
  "Explain page replacement algorithms.",
  "What are my weakest concepts right now?",
];

export default function TutorPage() {
  const [tab, setTab] = useState<"chat" | "session">("chat");

  return (
    <AppShell active="today" width="reading">
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold text-[#111111]">Tutor</h1>
          <p className="mt-1 text-sm text-[#77736D]">
            Ask about your preparation or the syllabus. Answers use your real
            numbers and cited sources — and any change to your plan waits for
            your confirmation.
          </p>
        </header>

        <div className="flex gap-2" role="tablist" aria-label="Tutor mode">
          <button
            role="tab"
            aria-selected={tab === "chat"}
            className={
              (tab === "chat" ? ui.segOn : ui.segOff) + " h-9 rounded-full px-4 text-sm"
            }
            onClick={() => setTab("chat")}
          >
            Chat
          </button>
          <button
            role="tab"
            aria-selected={tab === "session"}
            className={
              (tab === "session" ? ui.segOn : ui.segOff) + " h-9 rounded-full px-4 text-sm"
            }
            onClick={() => setTab("session")}
          >
            Log a session
          </button>
        </div>

        {tab === "chat" ? (
          <Suspense fallback={<ChatSkeleton />}>
            <TutorChatFromQuery />
          </Suspense>
        ) : (
          <SessionDraft />
        )}
      </div>
    </AppShell>
  );
}

/** Reads the ?unit/&intent params. Kept in its own component inside Suspense:
 * useSearchParams() forces client rendering, and the boundary keeps that from
 * emptying the rest of the page during the first paint. */
function TutorChatFromQuery() {
  const params = useSearchParams();
  const unit = params.get("unit");
  const presetMessage =
    unit && params.get("intent") === "low-confidence"
      ? `I just finished a session on ${unit} and I'm not confident about it. Looking at what I got wrong, should I keep going, take more time, or set it aside?`
      : null;
  return <TutorChat presetMessage={presetMessage} />;
}

function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="h-28 animate-pulse rounded-[20px] bg-[#ECE9E3]" />
    </div>
  );
}

/* ------------------------------- chat ------------------------------- */

function TutorChat({ presetMessage }: { presetMessage?: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listEnd = useRef<HTMLDivElement>(null);
  /** Prefilled questions send themselves once; a re-render must not resend. */
  const presetSent = useRef(false);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;

      setTurns((t) => [...t, { role: "student", text: message }]);
      setInput("");
      setBusy(true);
      try {
        const res = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const reply: TutorReply = await res.json();
        setTurns((t) => [...t, { role: "tutor", reply }]);
      } catch {
        setTurns((t) => [
          ...t,
          {
            role: "notice",
            text: "Couldn't reach the tutor. Your data is safe — try again in a moment.",
          },
        ]);
      } finally {
        setBusy(false);
        requestAnimationFrame(() =>
          listEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
        );
      }
    },
    [busy],
  );

  useEffect(() => {
    if (presetMessage && !presetSent.current) {
      presetSent.current = true;
      void send(presetMessage);
    }
  }, [presetMessage, send]);

  return (
    <div className="flex flex-col gap-4">
      {turns.length === 0 && (
        <div className={ui.card + " p-5"}>
          <p className="text-sm text-[#3a3a3a]">Try one of these to start:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                className="h-9 rounded-full border border-[#E3E0DA] px-4 text-sm text-[#111111] hover:bg-[#ECE9E3]"
                onClick={() => send(s)}
                disabled={busy}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <ol className="flex flex-col gap-4" aria-live="polite">
        {turns.map((turn, i) =>
          turn.role === "student" ? (
            <li key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-[20px] bg-[#111111] px-4 py-2.5 text-sm text-white">
                {turn.text}
              </p>
            </li>
          ) : turn.role === "notice" ? (
            <li
              key={i}
              className="rounded-[16px] border border-[#D98E2B] bg-[#F4DEB4]/40 p-3 text-sm text-[#111111]"
            >
              {turn.text}
            </li>
          ) : (
            <li key={i} className={ui.card + " p-5"}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#222222]">
                {turn.reply.answer}
              </p>

              {turn.reply.degraded && (
                <p className="mt-3 text-xs text-[#D98E2B]">
                  Generated from your stored data only — the explanation service
                  was unavailable.
                </p>
              )}

              {turn.reply.citations.length > 0 && (
                <div className="mt-4 border-t border-[#E3E0DA] pt-3">
                  <p className="text-xs font-semibold text-[#77736D]">Sources</p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {turn.reply.citations.map((c, ci) => (
                      <li key={c.url + ci} className="text-xs text-[#77736D]">
                        <span className="text-[#111111]">[{ci + 1}]</span>{" "}
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[#0E8074] underline decoration-[#E3E0DA] underline-offset-2"
                        >
                          {c.title}
                          {c.section ? ` — ${c.section}` : ""}
                        </a>{" "}
                        <span>
                          ({c.site}, {c.reliability.toLowerCase()})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {turn.reply.proposal && <ProposalCard proposal={turn.reply.proposal} />}
            </li>
          ),
        )}
      </ol>

      <div ref={listEnd} />

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          className="min-h-[52px] flex-1 rounded-[16px] border border-[#E3E0DA] p-3 text-sm outline-none focus:ring-2 focus:ring-[#0E8074]"
          placeholder="Ask about your progress, or say you feel unsure about a unit…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          aria-label="Message the tutor"
        />
        <button
          type="submit"
          className={ui.btn + " disabled:opacity-50"}
          disabled={busy || !input.trim()}
        >
          {busy ? "Thinking…" : "Send"}
        </button>
      </form>
      <p className="text-xs text-[#9B968E]">
        The tutor reads your stored progress, plus material a scheduled job
        fetched from the internet. It never changes your plan without your
        confirmation.
      </p>
    </div>
  );
}

/** The confirm step. The proposal is wording only until the student presses
 * the button, which posts to /api/tutor/actions for real. */
function ProposalCard({ proposal }: { proposal: Proposal }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [effects, setEffects] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/tutor/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: proposal.kind,
          unitId: proposal.unitId,
          extendDays: proposal.extendDays,
          snoozeDays: proposal.snoozeDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not apply that change.");
      setEffects(data.effects ?? []);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply that change.");
      setState("error");
    }
  }

  return (
    <div className="mt-4 rounded-[16px] border border-[#0E8074]/40 bg-[#BDEBD9]/25 p-4">
      <p className="text-sm font-semibold text-[#111111]">{proposal.title}</p>
      <p className="mt-1 text-sm text-[#3a3a3a]">{proposal.detail}</p>

      {state === "done" ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-[#0E8074]">Applied</p>
          <ul className="mt-1 list-inside list-disc text-xs text-[#3a3a3a]">
            {effects.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : (
        <button
          className={ui.btn + " mt-3 disabled:opacity-50"}
          onClick={confirm}
          disabled={state === "saving"}
        >
          {state === "saving" ? "Applying…" : proposal.confirmLabel}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-[#D98E2B]">{error}</p>}
    </div>
  );
}

/* ----------------------------- session draft ----------------------------- */

function SessionDraft() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<StudyReportDraft | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<"idle" | "saving" | "saved" | "error">("idle");

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
      if (data.kind === "draft") setDraft(data.draft);
      else setUnavailableReason(data.reason);
    } catch {
      setUnavailableReason(
        "Couldn't reach the extraction service. Use the manual Quick Study Report form instead.",
      );
    } finally {
      setLoading(false);
    }
  }

  function updateDraft<K extends keyof StudyReportDraft>(key: K, value: StudyReportDraft[K]) {
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
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[#77736D]">
        Describe what you studied in your own words. I&apos;ll draft a study
        report — you review and confirm it before anything updates your progress.
      </p>

      <textarea
        className="min-h-[100px] w-full rounded-[16px] border border-[#E3E0DA] p-3 text-sm outline-none focus:ring-2 focus:ring-[#0E8074]"
        placeholder='e.g. "Finished OS Unit 2 but page replacement is confusing. Got 9/15 questions right, still mixing up FIFO and LRU."'
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button
        className={ui.btn + " self-end disabled:opacity-50"}
        onClick={handleSend}
        disabled={loading || !message.trim()}
      >
        {loading ? "Extracting…" : "Send"}
      </button>

      {unavailableReason && (
        <div className="rounded-[16px] border border-[#D98E2B] bg-[#F4DEB4]/40 p-4 text-sm text-[#111111]">
          {unavailableReason}
        </div>
      )}

      {draft && (
        <div className={ui.card + " flex flex-col gap-4 p-5"}>
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
                  updateDraft("status", e.target.value as StudyReportDraft["status"])
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
                onChange={(e) => updateDraft("continueUnit", e.target.value === "yes")}
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
                    e.target.value === "" ? null : Number(e.target.value),
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
                    e.target.value === "" ? null : Number(e.target.value),
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
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
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
            className="h-10 self-start rounded-full bg-[#0E8074] px-5 text-sm text-white disabled:opacity-50"
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
            <p className="text-xs text-[#D98E2B]">
              Couldn&apos;t save — try the manual Quick Study Report form.
            </p>
          )}
        </div>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 10px;
          border: 1px solid #E3E0DA;
          padding: 8px 10px;
          font-size: 14px;
          outline: none;
        }
        .input:focus {
          box-shadow: 0 0 0 2px #0E8074;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[#77736D]">
      {label}
      {children}
    </label>
  );
}
