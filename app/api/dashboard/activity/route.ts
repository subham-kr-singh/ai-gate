import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getActivitySeries } from "@/server/domains/mastery/dashboard.queries";
import { DEFAULT_TIMEZONE } from "@/server/domains/planner/planner.repository";

/**
 * GET /api/dashboard/activity?days=N&subject=<id>
 *
 * Activity series for the dashboard's range toggle, so switching to Monthly
 * doesn't refetch the whole page. Read-only: the plan's timezone is read with
 * a `select` and never created, since a GET has no side effects.
 */
export const dynamic = "force-dynamic";

const MAX_DAYS = 120;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const raw = Number(req.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_DAYS) : 14;

  // The id is verified against the syllabus before it reaches a query, so an
  // arbitrary string can't be used to probe the shape of the data.
  const requested = req.nextUrl.searchParams.get("subject");
  const subjectId = requested
    ? (await db.subject.findUnique({ where: { id: requested }, select: { id: true } }))?.id ?? null
    : null;

  const plan = await db.studyPlan.findUnique({
    where: { userId: user.id },
    select: { timezone: true },
  });

  const series = await getActivitySeries(user.id, {
    days,
    timezone: plan?.timezone ?? DEFAULT_TIMEZONE,
    subjectId,
  });
  return NextResponse.json(series);
}
