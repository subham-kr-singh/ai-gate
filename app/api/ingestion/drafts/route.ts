import { json, withUser } from "@/server/http/api";
import { listDrafts, listStagedUnits } from "@/server/domains/ingestion/review.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/ingestion/drafts?status=DRAFT&adapter=gopdfs&release=gatecse-2026
 *                        &unit=volume1:2.2&ready=1&limit=50&units=1
 *
 * The review queue plus its counters. `ready=1` narrows to drafts that could
 * be approved as-is, which is what a reviewer wants to see first. `units=1`
 * returns the unit list instead of the drafts, so the review UI can offer a
 * unit selector without a second endpoint.
 */
export const GET = withUser(async (_userId, req) => {
  const params = new URL(req.url).searchParams;
  const adapterId = params.get("adapter") ?? undefined;
  const releaseTag = params.get("release") ?? undefined;

  if (params.get("units") === "1") {
    return json({ units: await listStagedUnits({ adapterId, releaseTag }) });
  }

  return json(
    await listDrafts({
      status: params.get("status") ?? undefined,
      adapterId,
      releaseTag,
      sourceUnitId: params.get("unit") ?? undefined,
      readyOnly: params.get("ready") === "1",
      limit: params.get("limit") ? Number(params.get("limit")) : undefined,
    })
  );
});
