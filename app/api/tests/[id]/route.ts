import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/auth/require";
import { resumeTest } from "@/server/domains/tests/test.service";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const test = await resumeTest(params.id, user.id);

    // Strip answer keys/solutions before this ever reaches the client —
    // the whole point of server-side grading is that the browser never
    // holds the correct answer while the test is in progress.
    const safeTestQuestions = test.testQuestions.map((tq) => {
      const { correctAnswer, solution, natTolerance, ...safeQuestion } = tq.question;
      return { ...tq, question: safeQuestion };
    });

    return NextResponse.json({ ...test, testQuestions: safeTestQuestions });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load test." },
      { status: 404 }
    );
  }
}
