import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/auth/require";
import { getTree } from "@/server/domains/syllabus/syllabus.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const tree = await getTree();
    return NextResponse.json(tree);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to load syllabus." }, { status: 500 });
  }
}
