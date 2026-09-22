import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { askTutor } from "@/server/domains/tutor/tutor.service";

/**
 * POST /api/tutor
 *
 * The tutor's read path. Returns a grounded answer, its citations, and — when
 * the student asked for a plan change or flagged low confidence — a proposal
 * they must confirm via POST /api/tutor/actions.
 *
 * This route never writes learning state.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({ message: z.string().trim().min(1).max(4000) });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request body" }, { status: 400 });

  try {
    const reply = await askTutor(user.id, parsed.data.message);
    return NextResponse.json(reply);
  } catch (err) {
    console.error("[api/tutor] failed", err);
    return NextResponse.json({ error: "The tutor could not answer just now." }, { status: 500 });
  }
}
