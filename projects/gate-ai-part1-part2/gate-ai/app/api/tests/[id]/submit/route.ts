import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/auth/require";
import { submitTest } from "@/server/domains/tests/test.service";

// validate request → testService.submit() → gradingService → attemptService
// → (masteryService lands in Part 3) → emit event (Inngest lands in Part 5+).
// No business logic lives in this handler — see PROJECT_PLAN.md "Thin API
// Layer".
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const result = await submitTest(params.id, user.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Submit failed." },
      { status: 400 }
    );
  }
}
