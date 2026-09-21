import { NextResponse } from "next/server";
import { runDailyMaintenance } from "@/server/jobs/daily-maintenance";
import { runWeeklyReview } from "@/server/jobs/weekly-review";
import { listUserIds } from "@/server/domains/planner/planner.repository";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/daily and /api/cron/weekly, called by Vercel Cron (see vercel.json).
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 */
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  const { job } = await params;
  if (job !== "daily" && job !== "weekly") return NextResponse.json({ error: "Unknown job." }, { status: 404 });

  // Wire Part 4 here once it exposes a server-side generator, e.g.:
  //   const hooks = { prepareDpp: (userId: string) => dppService.generateToday(userId) };
  const hooks = {};

  const results: unknown[] = [];
  for (const userId of await listUserIds()) {
    results.push(job === "daily" ? await runDailyMaintenance(userId, new Date(), hooks) : await runWeeklyReview(userId));
  }
  return NextResponse.json({ job, results });
}
