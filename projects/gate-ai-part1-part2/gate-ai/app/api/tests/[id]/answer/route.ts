import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/auth/require";
import { autosaveAnswer } from "@/server/domains/tests/test.service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const result = await autosaveAnswer(params.id, user.id, body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Autosave failed." },
      { status: 400 }
    );
  }
}
