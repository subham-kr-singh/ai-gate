import { json, withUser } from "@/server/http/api";
import { getToday } from "@/server/domains/planner/planner.service";

export const dynamic = "force-dynamic";

/** GET /api/planner/today — the next best action, with reasons. Safe to call repeatedly. */
export const GET = withUser(async (userId) => json(await getToday(userId)));
