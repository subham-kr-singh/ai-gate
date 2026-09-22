import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { detectStudySessions } from "@/server/domains/mastery/session-detect.service";

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

  const sessions = await detectStudySessions(user.id, { days });
  return NextResponse.json({ sessions });
}
