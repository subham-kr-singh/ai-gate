"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * The draft review queue (§54 "Review / Publish").
 *
 * Layout follows DESIGN.md: hairline dividers, no page-level shadow, square
 * column edges. The queue is a two-pane split — a list on the left and the
 * selected draft's evidence on the right — because the decision needs the raw
 * text, the validation notes and the classification visible at once.
 *
 * Colour carries meaning and nothing else: teal marks something that can be
 * approved, amber marks a draft that is blocked. Both are the same two signals
 * the rest of the app uses.
 */

export interface DraftRow {
  id: string;
  sourceAdapterId: string;
  sourceReliability: string;
  sourceReleaseTag: string;
  sourceQuestionId: string | null;
  /** The source's unit this question was filed under (GO section, "1.1"). */
  sourceUnitId: string | null;
  sourceUnitLabel: string | null;
  sourcePdfUrl: string | null;
  status: string;
  validationErrorCount: number;
  createdAt: string;
  reviewedAt: string | null;
  promotedQuestionId: string | null;
  statementPreview: string;
}

export interface DraftSummary {
  total: number;
  byStatus: Record<string, number>;
  readyToApprove: number;
  byAdapter: { adapterId: string; count: number }[];
}

interface DraftDetail extends DraftRow {
  rawBlockText: string;
  extracted: unknown;
  classification: unknown;
  provenance: unknown;
  corroboratingSources: unknown;
  validationErrors: string[];
  normalizedStatement: string | null;
  contentHash: string;
  payloadValid: boolean;
  payloadIssues: { path: string; message: string }[];
  canApprove: boolean;
  approveBlockedReason?: string;
}

const STATUS_FILTERS = ["DRAFT", "UNDER_REVIEW", "APPROVED", "REJECTED"] as const;
const FILTER_LABEL: Record<string, string> = {
  ALL: "All",
  DRAFT: "New",
  UNDER_REVIEW: "Flagged",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The decision endpoints report outcomes as data, not exceptions, so the
 * toast text is derived here rather than from a thrown error. */
function outcomeMessage(body: { outcome?: string; reason?: string; questionId?: string }): string {
  switch (body.outcome) {
    case "approved":
      return "Approved and published to the question bank.";
    case "rejected":
      return "Rejected. It stays in the queue for the record.";
    case "flagged":
      return "Flagged for a closer look.";
    case "noop":
      return body.reason ?? "No change needed.";
    default:
      return body.reason ?? "Nothing changed.";
  }
}

export interface UnitOption {
  sourceUnitId: string;
  sourceUnitLabel: string | null;
  releaseTag: string;
  total: number;
  ready: number;
}

export function ReviewQueue({
  initialDrafts,
  initialSummary,
  initialUnits,
}: {
  initialDrafts: DraftRow[];
  initialSummary: DraftSummary;
  initialUnits: UnitOption[];
}) {
  const [drafts, setDrafts] = useState<DraftRow[]>(initialDrafts);
  const [summary, setSummary] = useState<DraftSummary>(initialSummary);
  const [filter, setFilter] = useState<string>("ALL");
  const [adapter, setAdapter] = useState<string>("ALL");
  const [unit, setUnit] = useState<string>("ALL");
  const [units, setUnits] = useState<UnitOption[]>(initialUnits);
  const [selectedId, setSelectedId] = useState<string | null>(initialDrafts[0]?.id ?? null);
  const [detail, setDetail] = useState<DraftDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const refreshList = useCallback(
    async (nextFilter = filter, nextAdapter = adapter, nextUnit = unit) => {
      const params = new URLSearchParams({ limit: "100" });
      if (nextFilter !== "ALL") params.set("status", nextFilter);
      if (nextAdapter !== "ALL") params.set("adapter", nextAdapter);
      if (nextUnit !== "ALL") params.set("unit", nextUnit);

      const res = await apiFetch<{ drafts: DraftRow[]; summary: DraftSummary }>(
        `/api/ingestion/drafts?${params}`,
        {},
        "Could not load the review queue."
      );
      if (!res.ok || !res.body) {
        setListError(res.error ?? "Could not load the review queue.");
        return [];
      }
      setListError(null);
      setDrafts(res.body.drafts);
      setSummary(res.body.summary);
      // Keep a selection that still exists; otherwise fall back to the first row.
      setSelectedId((cur) =>
        cur && res.body!.drafts.some((d) => d.id === cur) ? cur : (res.body!.drafts[0]?.id ?? null)
      );
      return res.body.drafts;
    },
    [filter, adapter, unit]
  );

  // The unit list is scoped to the adapter, so switching source refreshes it.
  // A unit that no longer exists in the new scope resets to "All units" rather
  // than showing an empty queue.
  const loadUnits = useCallback(async (nextAdapter: string) => {
    const params = new URLSearchParams({ units: "1" });
    if (nextAdapter !== "ALL") params.set("adapter", nextAdapter);
    const res = await apiFetch<{ units: UnitOption[] }>(
      `/api/ingestion/drafts?${params}`,
      {},
      "Could not load the unit list."
    );
    if (!res.ok || !res.body) return;
    setUnits(res.body.units);
    setUnit((cur) => (cur === "ALL" || res.body!.units.some((u) => u.sourceUnitId === cur) ? cur : "ALL"));
  }, []);

  // Load the selected draft's full evidence. Called on selection and after a
  // decision, because a decision changes what the detail pane should say.
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    const res = await apiFetch<DraftDetail>(
      `/api/ingestion/drafts/${id}`,
      {},
      "Could not load that draft."
    );
    setDetailLoading(false);
    if (!res.ok || !res.body) {
      setDetail(null);
      setNotice({ tone: "warn", text: res.error ?? "Could not load that draft." });
      return;
    }
    setDetail(res.body);
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setNotice(null);
  }, []);

  // One place loads the detail pane: on mount, on click, and when a refresh
  // reselects a different row. Guarded on the id so a decision (which reloads
  // the list) does not refetch what is already displayed.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    if (detail?.id === selectedId) return;
    void loadDetail(selectedId);
  }, [selectedId, detail?.id, loadDetail]);

  const decide = useCallback(
    async (id: string, decision: "approve" | "reject" | "flag") => {
      setBusy(true);
      setNotice(null);
      const res = await apiFetch<{ outcome?: string; reason?: string; questionId?: string }>(
        `/api/ingestion/drafts/${id}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
        "The decision did not go through."
      );
      setBusy(false);

      // 409 is the documented "refused, and here is why" — amber, not a failure.
      if (!res.ok && res.status === 409) {
        setNotice({ tone: "warn", text: res.error ?? res.body?.reason ?? "This draft cannot be approved yet." });
        void loadDetail(id);
        return;
      }
      if (!res.ok || !res.body) {
        setNotice({ tone: "warn", text: res.error ?? "The decision did not go through." });
        return;
      }

      setNotice({ tone: "ok", text: outcomeMessage(res.body) });
      const updated = await refreshList();

      // Working a queue means deciding and moving on. Approve and reject are
      // terminal, so advance to the next row and let the toast report what
      // happened; flag is a detour, so the draft stays open for the note.
      if (decision !== "flag" && updated.length > 1) {
        const idx = updated.findIndex((d) => d.id === id);
        const next = idx === -1 ? updated[0] : updated[idx + 1] ?? updated[0];
        if (next && next.id !== id) {
          // The selection effect loads the detail; calling loadDetail here too
          // would fetch the same draft twice.
          setSelectedId(next.id);
          return;
        }
      }
      void loadDetail(id);
    },
    [loadDetail, refreshList]
  );

  const adapters = useMemo(
    () => ["ALL", ...summary.byAdapter.map((a) => a.adapterId)],
    [summary.byAdapter]
  );

  return (
    <div className="flex flex-col gap-5">
      <SummaryStrip summary={summary} />

      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", ...STATUS_FILTERS] as const).map((s) => {
          const count = s === "ALL" ? summary.total : summary.byStatus[s] ?? 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                setFilter(s);
                void refreshList(s, adapter);
              }}
              className={cn(
                "h-9 rounded-full px-4 text-sm transition-colors",
                filter === s ? "bg-ink text-white" : "bg-control text-ink-soft hover:bg-line"
              )}
            >
              {FILTER_LABEL[s] ?? s}
              <span className={cn("ml-2 text-xs", filter === s ? "text-white/70" : "text-slate")}>
                {count}
              </span>
            </button>
          );
        })}

        {adapters.length > 2 && (
          <select
            value={adapter}
            onChange={(e) => {
              setAdapter(e.target.value);
              void loadUnits(e.target.value);
              void refreshList(filter, e.target.value, "ALL");
              setUnit("ALL");
            }}
            className="h-9 rounded-full bg-control px-4 text-sm text-ink-soft outline-none"
            aria-label="Filter by source"
          >
            {adapters.map((a) => (
              <option key={a} value={a}>
                {a === "ALL" ? "All sources" : a}
              </option>
            ))}
          </select>
        )}

        {units.length > 0 && (
          <select
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              void refreshList(filter, adapter, e.target.value);
            }}
            className="h-9 max-w-[18rem] rounded-full bg-control px-4 text-sm text-ink-soft outline-none"
            aria-label="Filter by source unit"
          >
            <option value="ALL">All units</option>
            {units.map((u) => (
              <option key={`${u.releaseTag}:${u.sourceUnitId}`} value={u.sourceUnitId}>
                {u.sourceUnitId} · {u.sourceUnitLabel ?? "untitled"} ({u.total} staged
                {u.ready > 0 ? `, ${u.ready} ready` : ""})
              </option>
            ))}
          </select>
        )}
      </div>

      {notice && (
        <p
          role="status"
          className={cn(
            "rounded-[12px] px-4 py-3 text-sm",
            notice.tone === "ok" ? "bg-mint/50 text-ink" : "bg-butter/60 text-ink"
          )}
        >
          {notice.text}
        </p>
      )}

      {listError ? (
        <p className="rounded-[12px] bg-butter/60 px-4 py-3 text-sm text-ink">{listError}</p>
      ) : drafts.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {drafts.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => select(d.id)}
                  aria-current={selectedId === d.id}
                  className={cn(
                    "flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors",
                    selectedId === d.id ? "bg-control/60" : "hover:bg-control/30"
                  )}
                >
                  <span className="line-clamp-2 text-sm text-ink">{d.statementPreview || "(no statement text)"}</span>
                  <span className="flex items-center gap-2 text-xs text-slate">
                    <StatusDot status={d.status} />
                    <span>{STATUS_LABEL[d.status] ?? d.status}</span>
                    <span aria-hidden>·</span>
                    <span>{d.sourceAdapterId}</span>
                    {d.sourceUnitId && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-ink-soft">{d.sourceUnitId}</span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <span>{shortDate(d.createdAt)}</span>
                    {d.validationErrorCount > 0 && (
                      <span className="text-amber">{d.validationErrorCount} note(s)</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0">
            {detailLoading && !detail ? (
              <p className="text-sm text-slate">Loading…</p>
            ) : detail ? (
              <DraftPane detail={detail} busy={busy} onDecide={decide} />
            ) : (
              <p className="text-sm text-slate">Select a draft to see its details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "New",
  UNDER_REVIEW: "Flagged",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** Teal = published, amber = needs a human, slate = already decided. */
function StatusDot({ status }: { status: string }) {
  const tone =
    status === "APPROVED" ? "bg-teal" : status === "UNDER_REVIEW" ? "bg-amber" : "bg-slate-light";
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone)} aria-hidden />;
}

function SummaryStrip({ summary }: { summary: DraftSummary }) {
  const items = [
    { label: "In the queue", value: summary.byStatus.DRAFT ?? 0, tone: "" },
    { label: "Ready to approve", value: summary.readyToApprove, tone: "text-teal" },
    { label: "Flagged", value: summary.byStatus.UNDER_REVIEW ?? 0, tone: "text-amber" },
    { label: "Published", value: summary.byStatus.APPROVED ?? 0, tone: "" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-[16px] border border-line bg-white px-4 py-3">
          <p className={cn("text-2xl font-semibold", i.tone || "text-ink")}>{i.value}</p>
          <p className="text-xs text-slate">{i.label}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filter }: { filter: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-white px-6 py-10 text-center">
      <p className="text-sm text-ink">
        {filter === "ALL" ? "Nothing has been staged yet." : `Nothing is ${(FILTER_LABEL[filter] ?? filter).toLowerCase()}.`}
      </p>
      <p className="mt-1 text-xs text-slate">
        Run an ingestion job to stage drafts, then come back here to review them.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs uppercase tracking-wide text-slate-light">{label}</p>
      <div className="text-sm text-ink">{children}</div>
    </div>
  );
}

function DraftPane({
  detail,
  busy,
  onDecide,
}: {
  detail: DraftDetail;
  busy: boolean;
  onDecide: (id: string, decision: "approve" | "reject" | "flag") => void;
}) {
  // A promoted draft is terminal: its question is live, so none of the three
  // decisions apply any more. `decided` covers both terminal states for the
  // banner; `published` is the one the buttons must respect.
  const published = detail.status === "APPROVED" && Boolean(detail.promotedQuestionId);
  const decided = detail.status === "APPROVED" || detail.status === "REJECTED";

  return (
    <article className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs text-slate">
            <StatusDot status={detail.status} />
            <span>{STATUS_LABEL[detail.status] ?? detail.status}</span>
            <span aria-hidden>·</span>
            <span>{detail.sourceAdapterId}</span>
            <span aria-hidden>·</span>
            <span>{detail.sourceReliability}</span>
            <span aria-hidden>·</span>
            <span>{detail.sourceReleaseTag}</span>
          </div>
          {detail.sourceQuestionId && (
            <p className="text-xs text-slate-light">Source id {detail.sourceQuestionId}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={busy || published || detail.status === "UNDER_REVIEW"}
            onClick={() => onDecide(detail.id, "flag")}
          >
            Flag
          </Button>
          <Button
            variant="secondary"
            disabled={busy || published || detail.status === "REJECTED"}
            onClick={() => onDecide(detail.id, "reject")}
          >
            Reject
          </Button>
          <Button
            disabled={busy || published || !detail.canApprove}
            onClick={() => onDecide(detail.id, "approve")}
          >
            Approve &amp; publish
          </Button>
        </div>
      </div>

      {!detail.canApprove && !decided && (
        <p className="rounded-[12px] bg-butter/60 px-4 py-3 text-sm text-ink">
          {detail.approveBlockedReason}
          {detail.validationErrors.length > 0 && (
            <span className="mt-1 block text-xs text-slate">
              Fix the notes below, or reject the draft.
            </span>
          )}
        </p>
      )}

      {decided && (
        <p className="rounded-[12px] bg-mint/40 px-4 py-3 text-sm text-ink">
          {detail.status === "APPROVED"
            ? `Published as question ${detail.promotedQuestionId ?? ""}. Withdraw it from the question bank, not here.`
            : "This draft was rejected. It is kept for the record."}
        </p>
      )}

      <Field label="Statement">
        <p className="whitespace-pre-wrap">{stringOf((detail.extracted as { statement?: unknown })?.statement) || "(none)"}</p>
      </Field>

      <OptionsBlock extracted={detail.extracted} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Answer key">
          <p>{answerOf(detail.extracted)}</p>
        </Field>
        <Field label="Mapping">
          <p>{mappingOf(detail.classification)}</p>
        </Field>
      </div>

      {detail.validationErrors.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-slate-light">Validation notes</p>
          <ul className="flex flex-col gap-1">
            {detail.validationErrors.map((e, i) => (
              <li key={i} className="rounded-[10px] bg-butter/50 px-3 py-2 text-sm text-ink">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!detail.payloadValid && (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-slate-light">Schema issues</p>
          <ul className="flex flex-col gap-1">
            {detail.payloadIssues.map((e, i) => (
              <li key={i} className="rounded-[10px] bg-butter/50 px-3 py-2 text-xs text-ink">
                <span className="text-slate">{e.path}</span> — {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ProvenanceBlock detail={detail} />

      <details className="rounded-[12px] border border-line">
        <summary className="cursor-pointer px-4 py-3 text-sm text-ink">Raw extracted block</summary>
        <pre className="max-h-80 overflow-auto border-t border-line px-4 py-3 text-xs text-slate">
          {detail.rawBlockText.slice(0, 4000) || "(empty)"}
        </pre>
      </details>
    </article>
  );
}

function stringOf(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function OptionsBlock({ extracted }: { extracted: unknown }) {
  const options = (extracted as { options?: { id?: string; text?: string }[] } | null)?.options;
  if (!options?.length) return null;
  return (
    <Field label="Options">
      <ul className="flex flex-col gap-1">
        {options.map((o, i) => (
          <li key={o.id ?? i} className="flex gap-2">
            <span className="w-5 shrink-0 text-slate">{o.id ?? i + 1}</span>
            <span className={o.text ? "" : "text-amber"}>
              {o.text || "(no extractable text — the source rasterised this option)"}
            </span>
          </li>
        ))}
      </ul>
    </Field>
  );
}

function answerOf(extracted: unknown): string {
  const a = (extracted as { correctAnswer?: unknown } | null)?.correctAnswer;
  if (Array.isArray(a)) return a.join(", ");
  if (typeof a === "string") return a;
  return "(none)";
}

/** Classification is stored as free JSON; render whichever of the known keys
 * are present rather than assuming one shape across adapters. */
function mappingOf(classification: unknown): string {
  const c = classification as
    | { subjectName?: string; unitName?: string; topicName?: string; confidence?: number; matchedOn?: string; rationale?: string }
    | null;
  if (!c) return "Not mapped to the syllabus.";
  const parts = [c.subjectName, c.unitName, c.topicName].filter(Boolean);
  const head = parts.length ? parts.join(" › ") : "Not mapped to the syllabus.";
  const meta: string[] = [];
  if (typeof c.confidence === "number") meta.push(`${Math.round(c.confidence * 100)}% confidence`);
  if (c.matchedOn) meta.push(c.matchedOn);
  return meta.length ? `${head} (${meta.join(", ")})` : head;
}

function ProvenanceBlock({ detail }: { detail: DraftDetail }) {
  const urls = Array.isArray(detail.provenance)
    ? (detail.provenance as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  const corroborating = Array.isArray(detail.corroboratingSources)
    ? (detail.corroboratingSources as { adapterId?: string; url?: string }[])
    : [];

  if (!urls.length && !corroborating.length && !detail.sourcePdfUrl) return null;

  return (
    <Field label="Provenance">
      <ul className="flex flex-col gap-1">
        {detail.sourcePdfUrl && (
          <li>
            <a href={detail.sourcePdfUrl} target="_blank" rel="noreferrer" className="text-teal underline">
              Source PDF
            </a>
          </li>
        )}
        {urls.map((u) => (
          <li key={u}>
            <a href={u} target="_blank" rel="noreferrer" className="text-teal underline">
              {u}
            </a>
          </li>
        ))}
        {corroborating.map((c, i) => (
          <li key={i} className="text-xs text-slate">
            Also stated by {c.adapterId ?? "another source"}
            {c.url ? (
              <>
                {" — "}
                <a href={c.url} target="_blank" rel="noreferrer" className="text-teal underline">
                  {c.url}
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </Field>
  );
}
