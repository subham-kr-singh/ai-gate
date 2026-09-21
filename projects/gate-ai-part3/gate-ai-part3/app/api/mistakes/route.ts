import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { MistakeError, getMistakeSummary, listMistakes, setMistakeResolved, tagMistake } from "@/server/domains/mistakes/mistake.service";
import { MISTAKE_TYPES, type MistakeFilters } from "@/server/domains/mistakes/mistake.types";

const tagBody = z
  .object({
    kind: z.literal("tag"),
    mistakeId: z.string().min(1).optional(),
    answerId: z.string().min(1).optional(),
    mistakeType: z.enum(MISTAKE_TYPES),
    note: z.string().max(1000).optional(),
  })
  .refine((b) => b.mistakeId || b.answerId, { message: "mistakeId or answerId is required" });

const resolveBody = z.object({
  kind: z.literal("resolve"),
  mistakeId: z.string().min(1),
  resolved: z.boolean(),
});

const body = z.union([tagBody, resolveBody]);

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to view mistakes." }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const type = q.get("type");
  const status = q.get("status");
  const filters: MistakeFilters = {
    type: type === "UNTAGGED" || (MISTAKE_TYPES as readonly string[]).includes(type ?? "") ? (type as MistakeFilters["type"]) : undefined,
    subjectId: q.get("subjectId") || undefined,
    unitId: q.get("unitId") || undefined,
    status: status === "resolved" || status === "all" ? status : "open",
    limit: Math.min(Number(q.get("limit")) || 50, 200),
  };
  const [items, summary] = await Promise.all([listMistakes(user.id, filters), getMistakeSummary(user.id)]);
  return NextResponse.json({ items, summary });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to update mistakes." }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const b = parsed.data;
    if (b.kind === "tag") await tagMistake(user.id, b);
    else await setMistakeResolved(user.id, b.mistakeId, b.resolved);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof MistakeError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
