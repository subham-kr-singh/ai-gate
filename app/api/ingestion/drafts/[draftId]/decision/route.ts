import { json, withUser } from "@/server/http/api";
import { decide, draftDecisionSchema } from "@/server/domains/ingestion/review.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/ingestion/drafts/:draftId/decision — approve, reject, or flag one
 * draft. The body is `{ decision, note? }`.
 *
 * A blocked approval returns 409 with the reason (and the schema issues when
 * that is the cause), so the UI can explain the refusal instead of showing a
 * generic failure. A repeat decision returns 200 with `outcome: "noop"`, which
 * makes the endpoint safe to retry.
 */
export const POST = withUser<{ draftId: string }>(async (_userId, req, { draftId }) => {
  const input = draftDecisionSchema.parse(await req.json());
  const result = await decide(draftId, input);

  if (result.outcome === "blocked") {
    return json(
      { outcome: result.outcome, reason: result.reason, issues: result.issues ?? [] },
      { status: 409 }
    );
  }
  return json(result);
});
