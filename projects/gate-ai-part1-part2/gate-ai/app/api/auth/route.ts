import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isEmailAllowed } from "@/server/auth/allowlist";
import { createSession, destroySession } from "@/server/auth/session";

const loginSchema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  if (!isEmailAllowed(parsed.data.email)) {
    // Deliberately vague — do not reveal whether an email exists on the
    // allowlist to an unauthenticated caller.
    return NextResponse.json({ error: "This email is not permitted to sign in." }, { status: 403 });
  }

  createSession(parsed.data.email);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  destroySession();
  return NextResponse.json({ ok: true });
}
