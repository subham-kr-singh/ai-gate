import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { detectStudySessions } from "@/server/domains/mastery/session-detect.service";
import { DEFAULT_TIMEZONE } from "@/server/domains/planner/planner.repository";
import { db } from "@/server/db/client";

/**
 * GET /api/study-sessions
 *
 * The study sessions the platform already recorded from quizzes, mocks and
 * DPPs. Read-only — evidence was applied when each test was submitted.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("days");
  const parsed = raw ? Number(raw) : 14;
  const days = Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 90) : 14;

  // Day boundaries must follow the student's zone, exactly as the planner
  // does, or a session that crosses local midnight would be split in two.
  // Read (never create) the plan: a GET must not have write side effects.
  const plan = await db.studyPlan.findUnique({ where: { userId: user.id }, select: { timezone: true } });

  const sessions = await detectStudySessions(user.id, { days, timezone: plan?.timezone ?? DEFAULT_TIMEZONE });
  return NextResponse.json({ sessions });
}
