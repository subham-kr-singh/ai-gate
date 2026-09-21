import { json, withUser } from "@/server/http/api";
import { getPlanSettings, planSettingsSchema, updatePlanSettings } from "@/server/domains/planner/planner.service";

export const dynamic = "force-dynamic";

export const GET = withUser(async (userId) => json(await getPlanSettings(userId)));

/** PUT /api/planner/plan — exam date, preparation start, soft pace targets. */
export const PUT = withUser(async (userId, req) => {
  const input = planSettingsSchema.parse(await req.json());
  return json(await updatePlanSettings(userId, input));
});
