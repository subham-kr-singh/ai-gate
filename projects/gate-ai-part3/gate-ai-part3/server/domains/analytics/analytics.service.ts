import type { Prisma } from "@prisma/client";
import type { Db } from "../shared/db";

export type AnalyticsEventType =
  | "QUESTION_VIEWED"
  | "ANSWER_SUBMITTED"
  | "TEST_SUBMITTED"
  | "TOPIC_STUDIED"
  | "MISTAKE_CREATED"
  | "PLAN_ITEM_COMPLETED";

/** Append one raw event. Keep payloads small (ids and counts, not content). */
export async function track(
  db: Db,
  userId: string,
  type: AnalyticsEventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.analyticsEvent.create({ data: { userId, type, payload: payload as Prisma.InputJsonValue } });
}
