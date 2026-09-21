import { json, withUser } from "@/server/http/api";
import { overrideSchema, recordOverride } from "@/server/domains/planner/override.service";

/** POST /api/planner/override — follow, override, skip or snooze a recommendation. */
export const POST = withUser(async (userId, req) => {
  const input = overrideSchema.parse(await req.json());
  return json(await recordOverride(userId, input), { status: 201 });
});
