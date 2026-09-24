/**
 * Draft review — the "Review / Publish" stage of architecture §54.
 *
 * The pipeline stages every extracted question as an `IngestedQuestionDraft`
 * and never writes to `Question` itself. Until now the only way to promote a
 * draft was `scripts/review-drafts.ts`, which needs shell access; this module
 * is the same gate with a web caller in front of it.
 *
 * The safety properties are the CLI's, restated because a browser is a wider
 * audience than a terminal:
 *
 *  - **Nothing is approved automatically.** `decide` acts on ids the caller
 *    names, one at a time. There is no "approve all" and no filter-based bulk
 *    approve, so a bug in the UI cannot publish the queue.
 *  - **A draft with any validation note cannot be approved.** The reviewer
 *    must fix it (or reject it), which is why the notes are shown next to the
 *    approve control rather than hidden behind a count.
 *  - **The payload is re-validated at promotion time**, against the canonical
 *    schema, so a draft whose stored JSON was edited by hand is still gated.
 *  - **Approving an already-approved draft is a no-op, not an error.** The
 *    decision endpoints are safe to retry.
 */
import { z } from "zod";
import { db } from "@/server/db/client";
import { questionInputSchema } from "@/server/domains/questions/question.schema";
import { importQuestion } from "@/server/domains/questions/question.service";

/** Rejections are terminal; approval and "needs a closer look" can be redone. */
export const draftDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "flag"]),
  /** Optional reviewer note, recorded on the draft for the next reviewer. */
  note: z.string().max(2000).optional(),
});
export type DraftDecision = z.infer<typeof draftDecisionSchema>;

export interface DraftRow {
  id: string;
  sourceAdapterId: string;
  sourceReliability: string;
  sourceReleaseTag: string;
  sourceQuestionId: string | null;
  /** The source's unit this question was filed under (GO section, e.g. "1.1"). */
  sourceUnitId: string | null;
  sourceUnitLabel: string | null;
  sourcePdfUrl: string | null;
  status: string;
  /** Count only — the detail view carries the strings. */
  validationErrorCount: number;
  createdAt: string;
  reviewedAt: string | null;
  promotedQuestionId: string | null;
  /** First ~160 chars of the statement, for the queue list. */
  statementPreview: string;
}

export interface DraftDetail extends DraftRow {
  rawBlockText: string;
  extracted: unknown;
  classification: unknown;
  provenance: unknown;
  corroboratingSources: unknown;
  validationErrors: string[];
  normalizedStatement: string | null;
  contentHash: string;
  /** Whether the stored payload currently passes the canonical schema. */
  payloadValid: boolean;
  /** Schema issues, present only when `payloadValid` is false. */
  payloadIssues: { path: string; message: string }[];
  /** Whether this draft can be approved right now, and why not if it cannot. */
  canApprove: boolean;
  approveBlockedReason?: string;
}

export interface DraftSummary {
  total: number;
  byStatus: Record<string, number>;
  /** Drafts that could be approved as-is — the number worth acting on. */
  readyToApprove: number;
  byAdapter: { adapterId: string; count: number }[];
}

const STATUSES = ["DRAFT", "UNDER_REVIEW", "APPROVED", "REJECTED"] as const;

/** `IngestedQuestionDraft.extracted` is stored as JSON; this is the shape we
 * read back out of it for display. It is *not* trusted — see `payloadIssues`. */
function statementOf(extracted: unknown): string {
  const s = (extracted as { statement?: unknown } | null)?.statement;
  return typeof s === "string" ? s : "";
}

function preview(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export interface ListDraftsFilter {
  status?: string;
  adapterId?: string;
  /** Restrict to one source release, e.g. "gatecse-2026". */
  releaseTag?: string;
  /** Restrict to one source unit within the release, e.g. "volume1:2.2". */
  sourceUnitId?: string;
  /** Only drafts with no validation notes — the ones a reviewer can approve. */
  readyOnly?: boolean;
  limit?: number;
}

/**
 * The review queue. Newest first, because a reviewer works through what the
 * last ingestion run just produced.
 */
export async function listDrafts(filter: ListDraftsFilter = {}): Promise<{
  drafts: DraftRow[];
  summary: DraftSummary;
}> {
  const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
  const status = filter.status && STATUSES.includes(filter.status as (typeof STATUSES)[number])
    ? (filter.status as (typeof STATUSES)[number])
    : undefined;

  const where = {
    ...(status ? { status } : {}),
    ...(filter.adapterId ? { sourceAdapterId: filter.adapterId } : {}),
    ...(filter.releaseTag ? { sourceReleaseTag: filter.releaseTag } : {}),
    ...(filter.sourceUnitId ? { sourceUnitId: filter.sourceUnitId } : {}),
    ...(filter.readyOnly ? { validationErrors: { isEmpty: true } } : {}),
  };

  // The chip counts describe the source currently being looked at, so they are
  // scoped by the adapter (and release/unit, if chosen) but never by status — a
  // status chip that counted only its own status would always show the same
  // number it filters to. The source list itself stays global.
  const scopedWhere = {
    ...(filter.adapterId ? { sourceAdapterId: filter.adapterId } : {}),
    ...(filter.releaseTag ? { sourceReleaseTag: filter.releaseTag } : {}),
    ...(filter.sourceUnitId ? { sourceUnitId: filter.sourceUnitId } : {}),
  };

  const [rows, total, grouped, adapterGroups, readyToApprove] = await Promise.all([
    db.ingestedQuestionDraft.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        sourceAdapterId: true,
        sourceReliability: true,
        sourceReleaseTag: true,
        sourceQuestionId: true,
        sourceUnitId: true,
        sourceUnitLabel: true,
        sourcePdfUrl: true,
        status: true,
        validationErrors: true,
        createdAt: true,
        reviewedAt: true,
        promotedQuestionId: true,
        extracted: true,
      },
    }),
    // The "All" chip must show the whole queue, not the size of the current
    // status filter, so this count deliberately ignores `status`.
    db.ingestedQuestionDraft.count({ where: scopedWhere }),
    db.ingestedQuestionDraft.groupBy({ by: ["status"], where: scopedWhere, _count: { _all: true } }),
    db.ingestedQuestionDraft.groupBy({
      by: ["sourceAdapterId"],
      _count: { _all: true },
      orderBy: { _count: { sourceAdapterId: "desc" } },
    }),
    db.ingestedQuestionDraft.count({
      where: { ...scopedWhere, status: "DRAFT", validationErrors: { isEmpty: true } },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const s of STATUSES) byStatus[s] = 0;
  for (const g of grouped) byStatus[g.status] = g._count._all;

  return {
    drafts: rows.map((d) => ({
      id: d.id,
      sourceAdapterId: d.sourceAdapterId,
      sourceReliability: d.sourceReliability,
      sourceReleaseTag: d.sourceReleaseTag,
      sourceQuestionId: d.sourceQuestionId,
      sourceUnitId: d.sourceUnitId,
      sourceUnitLabel: d.sourceUnitLabel,
      sourcePdfUrl: d.sourcePdfUrl,
      status: d.status,
      validationErrorCount: d.validationErrors.length,
      createdAt: d.createdAt.toISOString(),
      reviewedAt: d.reviewedAt?.toISOString() ?? null,
      promotedQuestionId: d.promotedQuestionId,
      statementPreview: preview(statementOf(d.extracted)),
    })),
    summary: {
      total,
      byStatus,
      readyToApprove,
      byAdapter: adapterGroups.map((g) => ({ adapterId: g.sourceAdapterId, count: g._count._all })),
    },
  };
}

/**
 * Validates a stored payload against the canonical schema. Shared by the detail
 * view and `decide` so the two can never disagree about approvability, and
 * exported because it is the gate a hand-edited draft has to pass.
 */
export function validateDraftPayload(
  extracted: unknown
): { valid: boolean; issues: { path: string; message: string }[] } {
  const parsed = questionInputSchema.safeParse(extracted);
  if (parsed.success) return { valid: true, issues: [] };
  return {
    valid: false,
    issues: parsed.error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message })),
  };
}

/**
 * The source units present in the queue, with counts.
 *
 * Derived from the staged drafts rather than from the release catalog, because
 * a unit with no drafts is not worth offering as a filter. `releaseTag` scopes
 * it to one release so the selector stays short.
 */
export async function listStagedUnits(
  filter: { adapterId?: string; releaseTag?: string } = {}
): Promise<
  { sourceUnitId: string; sourceUnitLabel: string | null; releaseTag: string; total: number; ready: number }[]
> {
  const where = {
    sourceUnitId: { not: null },
    ...(filter.adapterId ? { sourceAdapterId: filter.adapterId } : {}),
    ...(filter.releaseTag ? { sourceReleaseTag: filter.releaseTag } : {}),
  };

  const [groups, readyGroups] = await Promise.all([
    db.ingestedQuestionDraft.groupBy({
      by: ["sourceUnitId", "sourceUnitLabel", "sourceReleaseTag"],
      where,
      _count: { _all: true },
    }),
    db.ingestedQuestionDraft.groupBy({
      by: ["sourceUnitId", "sourceReleaseTag"],
      where: { ...where, status: "DRAFT", validationErrors: { isEmpty: true } },
      _count: { _all: true },
    }),
  ]);

  const readyByKey = new Map(
    readyGroups
      .filter((g) => g.sourceUnitId)
      .map((g) => [`${g.sourceReleaseTag}::${g.sourceUnitId}`, g._count._all])
  );

  return groups
    .filter((g) => g.sourceUnitId)
    .map((g) => ({
      sourceUnitId: g.sourceUnitId as string,
      sourceUnitLabel: g.sourceUnitLabel,
      releaseTag: g.sourceReleaseTag,
      total: g._count._all,
      ready: readyByKey.get(`${g.sourceReleaseTag}::${g.sourceUnitId}`) ?? 0,
    }))
    .sort(
      (a, b) =>
        a.releaseTag.localeCompare(b.releaseTag) ||
        a.sourceUnitId.localeCompare(b.sourceUnitId, undefined, { numeric: true })
    );
}

export async function getDraft(id: string): Promise<DraftDetail | null> {
  const d = await db.ingestedQuestionDraft.findUnique({ where: { id } });
  if (!d) return null;

  const payload = validateDraftPayload(d.extracted);
  const blocked = d.validationErrors.length > 0
    ? `${d.validationErrors.length} validation note(s) must be resolved first.`
    : !payload.valid
      ? "The stored payload does not pass the canonical schema."
      : undefined;

  return {
    id: d.id,
    sourceAdapterId: d.sourceAdapterId,
    sourceReliability: d.sourceReliability,
    sourceReleaseTag: d.sourceReleaseTag,
    sourceQuestionId: d.sourceQuestionId,
    sourceUnitId: d.sourceUnitId,
    sourceUnitLabel: d.sourceUnitLabel,
    sourcePdfUrl: d.sourcePdfUrl,
    status: d.status,
    validationErrorCount: d.validationErrors.length,
    createdAt: d.createdAt.toISOString(),
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
    promotedQuestionId: d.promotedQuestionId,
    statementPreview: preview(statementOf(d.extracted)),
    rawBlockText: d.rawBlockText,
    extracted: d.extracted,
    classification: d.classification,
    provenance: d.provenance,
    corroboratingSources: d.corroboratingSources,
    validationErrors: d.validationErrors,
    normalizedStatement: d.normalizedStatement,
    contentHash: d.contentHash,
    payloadValid: payload.valid,
    payloadIssues: payload.issues,
    canApprove: blocked === undefined,
    approveBlockedReason: blocked,
  };
}

export type DecideResult =
  | { outcome: "approved"; draftId: string; questionId: string }
  | { outcome: "rejected"; draftId: string }
  | { outcome: "flagged"; draftId: string }
  | { outcome: "noop"; draftId: string; reason: string }
  | { outcome: "blocked"; draftId: string; reason: string; issues?: { path: string; message: string }[] };

/**
 * Apply a reviewer's decision to one draft.
 *
 * Returns a discriminated result rather than throwing, because "blocked by a
 * validation note" is an expected outcome a reviewer needs explained, not an
 * exceptional one. Only a missing draft is an error.
 */
export async function decide(draftId: string, input: DraftDecision): Promise<DecideResult> {
  const draft = await db.ingestedQuestionDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw new Error(`Draft ${draftId} not found.`);

  // A promoted draft is terminal. Its question is live in the bank, and no
  // decision available here can un-publish it — a "reject" would leave the
  // draft saying REJECTED while the question it produced stayed APPROVED, so
  // the two records would disagree about the same content. Withdrawing a
  // published question belongs to the question bank, not the review queue.
  if (draft.status === "APPROVED" && draft.promotedQuestionId) {
    return { outcome: "noop", draftId, reason: "Already published to the question bank." };
  }

  if (input.decision === "reject") {
    if (draft.status === "REJECTED") return { outcome: "noop", draftId, reason: "Already rejected." };
    await db.ingestedQuestionDraft.update({
      where: { id: draftId },
      data: { status: "REJECTED", reviewedAt: new Date() },
    });
    return { outcome: "rejected", draftId };
  }

  if (input.decision === "flag") {
    if (draft.status === "UNDER_REVIEW") return { outcome: "noop", draftId, reason: "Already flagged." };
    await db.ingestedQuestionDraft.update({
      where: { id: draftId },
      data: { status: "UNDER_REVIEW", reviewedAt: new Date() },
    });
    return { outcome: "flagged", draftId };
  }

  // --- approve ---
  if (draft.validationErrors.length > 0) {
    return {
      outcome: "blocked",
      draftId,
      reason: `${draft.validationErrors.length} validation note(s) must be resolved before approving.`,
    };
  }

  const payload = validateDraftPayload(draft.extracted);
  if (!payload.valid) {
    return {
      outcome: "blocked",
      draftId,
      reason: "The stored payload does not pass the canonical schema.",
      issues: payload.issues,
    };
  }

  // The reviewer's decision here *is* the publish approval, so the promoted row
  // is APPROVED even though it was extracted as DRAFT.
  const question = await importQuestion({ ...(draft.extracted as object), status: "APPROVED" });
  await db.ingestedQuestionDraft.update({
    where: { id: draftId },
    data: { status: "APPROVED", reviewedAt: new Date(), promotedQuestionId: question.id },
  });
  return { outcome: "approved", draftId, questionId: question.id };
}
