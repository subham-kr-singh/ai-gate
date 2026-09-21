import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/auth/require";
import { getAttemptHistory } from "@/server/domains/attempts/attempt.service";

export async function GET() {
  try {
    const user = await requireUser();
    const history = await getAttemptHistory(user.id);
    return NextResponse.json({ history });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to load attempt history." }, { status: 500 });
  }
}
