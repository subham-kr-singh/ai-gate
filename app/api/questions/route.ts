import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/auth/require";
import { searchQuestions } from "@/server/domains/questions/question.service";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const questions = await searchQuestions(params);
    // Never leak correctAnswer/solution in a browse/search listing —
    // that would let the client trivially cheat a topic quiz.
    const safe = questions.map(({ correctAnswer, solution, natTolerance, ...rest }) => rest);
    return NextResponse.json({ questions: safe });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to load questions." }, { status: 400 });
  }
}
