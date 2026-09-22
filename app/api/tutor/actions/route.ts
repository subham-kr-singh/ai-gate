import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import {
  applyTutorAction,
  describeAction,
  tutorActionSchema,
  TutorActionError,
} from "@/server/domains/tutor/tutor.actions";

/**
 * POST /api/tutor/actions
 *
 * The tutor's write path — and the only place a tutor-initiated change can
 * land. The client sends the action the student reviewed; the server
 * re-validates it and runs it through the same planner services the manual
 * Today screen uses, then logs it.
 *
 * A dry run (preview: true) returns the proposal wording without applying it,
 * which is what the tutor shows before the student confirms.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.union([
  z.object({ preview: z.literal(true) }).and(tutorActionSchema),
  z.object({ preview: z.literal(false).optional() }).and(tutorActionSchema),
]);

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  const { preview, ...action } = parsed.data;

  try {
    if (preview) {
      return NextResponse.json({ proposal: await describeAction(user.id, action) });
    }
    const result = await applyTutorAction(user.id, action);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof TutorActionError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid action", issues: err.issues }, { status: 400 });
    }
    console.error("[api/tutor/actions] failed", err);
    return NextResponse.json({ error: "Could not apply that change." }, { status: 500 });
  }
}
