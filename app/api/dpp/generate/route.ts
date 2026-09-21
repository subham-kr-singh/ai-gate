import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session"; // Part 1
import { generateTodaysDPP } from "@/server/domains/dpp/dpp.service";
import { DPP_CONFIG_V1 } from "@/server/domains/dpp/dpp.config";

/**
 * POST /api/dpp/generate
 *
 * Generates today's DPP for the signed-in user, or returns the existing
 * one if it was already generated today — see dpp.service.ts's
 * (userId, date) idempotency. Safe to call every time the practice page
 * loads; it will not reshuffle a set the student has already started.
 */
export async function POST() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const result = await generateTodaysDPP(
      { userId: session.id, date: new Date() },
      DPP_CONFIG_V1
    );
    return NextResponse.json(result, { status: result.createdNew ? 201 : 200 });
  } catch (err) {
    console.error("[dpp/generate] failed", err);
    return NextResponse.json(
      { error: "Could not generate today's DPP. Try again in a moment." },
      { status: 500 }
    );
  }
}
