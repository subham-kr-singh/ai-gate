import { json, withUser } from "@/server/http/api";
import { listDrafts } from "@/server/domains/ingestion/review.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/ingestion/drafts?status=DRAFT&adapter=gopdfs&ready=1&limit=50
 *
 * The review queue plus its counters. `ready=1` narrows to drafts that could
 * be approved as-is, which is what a reviewer wants to see first.
 */
export const GET = withUser(async (_userId, req) => {
  const params = new URL(req.url).searchParams;
  return json(
    await listDrafts({
      status: params.get("status") ?? undefined,
      adapterId: params.get("adapter") ?? undefined,
      readyOnly: params.get("ready") === "1",
      limit: params.get("limit") ? Number(params.get("limit")) : undefined,
    })
  );
});
