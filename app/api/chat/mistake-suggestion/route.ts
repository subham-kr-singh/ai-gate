import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { suggestMistakeTag } from "@/server/domains/ai/mistake-classifier";
import { getSessionEmail } from "@/server/auth/session";

const MistakeSuggestionRequestSchema = z.object({
  questionId: z.string(),
  statement: z.string(),
  studentSelectedAnswer: z.string(),
  correctAnswer: z.string(),
  timeTakenSec: z.number(),
  expectedTimeSec: z.number(),
  confidenceReported: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.null(),
  ]),
});

export async function POST(req: NextRequest) {
  const email = getSessionEmail();
  if (!email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: z.infer<typeof MistakeSuggestionRequestSchema>;
  try {
    body = MistakeSuggestionRequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const suggestion = await suggestMistakeTag(body);
  return NextResponse.json(suggestion, { status: 200 });
}
