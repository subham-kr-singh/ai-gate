import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { studyReportSchema } from "@/server/domains/mastery/study-report.schema";
import { StudyReportError, submitStudyReport } from "@/server/domains/mastery/study-report.service";

/**
 * POST a Quick Study Report. Retrying with the same clientRequestId is safe:
 * the response has duplicate: true and nothing is counted twice.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to log a study report." }, { status: 401 });

  const parsed = studyReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid study report.", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await submitStudyReport(user.id, parsed.data);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    if (e instanceof StudyReportError) return NextResponse.json({ error: e.message, code: e.code }, { status: 422 });
    throw e;
  }
}
