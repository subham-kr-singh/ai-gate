import { NextResponse } from "next/server";
import { getSyllabusTree } from "@/server/domains/syllabus/syllabus.service";

export async function GET() {
  const tree = await getSyllabusTree();
  if (!tree) {
    return NextResponse.json(
      { error: "No active syllabus version found. Run `npm run seed` first." },
      { status: 404 },
    );
  }
  return NextResponse.json(tree);
}
