import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isEmailAllowed } from "@/server/auth/allowlist";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/server/auth/session";
import { prisma } from "@/server/db/client";

const loginSchema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  if (!isEmailAllowed(email)) {
    return NextResponse.json(
      { error: "This email is not on the allowlist for this app." },
      { status: 403 }
    );
  }

  await prisma.user.upsert({
    where: { email },
    update: { lastLogin: new Date() },
    create: { email, lastLogin: new Date() },
  });

  const token = await createSessionToken(email);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
