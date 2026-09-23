import { json, withUser } from "@/server/http/api";
import { getDraft } from "@/server/domains/ingestion/review.service";

export const dynamic = "force-dynamic";

/** GET /api/ingestion/drafts/:draftId — one draft, with the full evidence a
 * reviewer needs: raw text, validation notes, classification, provenance. */
export const GET = withUser<{ draftId: string }>(async (_userId, _req, { draftId }) => {
  const draft = await getDraft(draftId);
  if (!draft) return json({ error: "That draft no longer exists." }, { status: 404 });
  return json(draft);
});
