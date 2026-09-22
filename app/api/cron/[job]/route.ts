import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { DPP_CONFIG_V1 } from "@/server/domains/dpp/dpp.config";
import { generateTodaysDPP } from "@/server/domains/dpp/dpp.service";
import { ingestAllSources } from "@/server/domains/resources/resource.service";
import { runDailyMaintenance } from "@/server/jobs/daily-maintenance";
import { runMockMaintenance } from "@/server/jobs/mock-maintenance";
import { runWeeklyReview } from "@/server/jobs/weekly-review";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron entry point (vercel.json schedules `/api/cron/daily` and
 * `/api/cron/weekly`). Vercel sends `Authorization: Bearer $CRON_SECRET`;
 * anything else is rejected so the endpoints cannot be triggered from outside.
 *
 * Every job is idempotent, so a retry after a timeout is safe.
 *
 * `resources` is the internet-data job: it refreshes the tutor's citation
 * library from the configured public sources. It has its own weekly schedule
 * (vercel.json) so a slow or failing fetch never delays planning work.
 */
export async function GET(req: Request, { params }: { params: { job: string } }) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set." } },
      { status: 500 }
    );
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Bad cron secret." } },
      { status: 401 }
    );
  }

  const now = new Date();
  try {
    if (params.job === "daily") {
      const mocks = await runMockMaintenance();

      // The planner jobs are per-user; this is a personal tool, so the sweep is small.
      const users = await db.user.findMany({ select: { id: true }, take: 500 });
      const results = [];
      for (const u of users) {
        try {
          results.push(
            await runDailyMaintenance(u.id, now, {
              prepareDpp: (userId, when) => generateTodaysDPP({ userId, date: when }, DPP_CONFIG_V1),
            })
          );
        } catch (e) {
          console.error(`[cron/daily] user ${u.id} failed`, e);
          results.push({ userId: u.id, error: e instanceof Error ? e.message : "failed" });
        }
      }
      return NextResponse.json({ job: "daily", at: now.toISOString(), users: results.length, mocks, results });
    }

    // Internet-data job: refresh the tutor's citation library. Isolated in its
    // own branch so a dead upstream host cannot fail the planning jobs.
    if (params.job === "resources") {
      const summary = await ingestAllSources();
      return NextResponse.json({ job: "resources", at: now.toISOString(), ...summary });
    }

    if (params.job === "weekly") {
      const users = await db.user.findMany({ select: { id: true }, take: 500 });
      const results = [];
      for (const u of users) {
        try {
          results.push(await runWeeklyReview(u.id, now));
        } catch (e) {
          console.error(`[cron/weekly] user ${u.id} failed`, e);
          results.push({ userId: u.id, error: e instanceof Error ? e.message : "failed" });
        }
      }
      return NextResponse.json({ job: "weekly", at: now.toISOString(), users: results.length, results });
    }

    return NextResponse.json(
      { error: { code: "UNKNOWN_JOB", message: `Unknown job "${params.job}".` } },
      { status: 404 }
    );
  } catch (err) {
    console.error(`[cron/${params.job}] failed`, err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Cron job failed." } },
      { status: 500 }
    );
  }
}
