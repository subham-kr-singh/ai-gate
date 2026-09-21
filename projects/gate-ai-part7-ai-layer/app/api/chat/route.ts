import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractStudyReportDraft } from "@/server/domains/ai/study-report-extractor";
import { suggestMistakeTag } from "@/server/domains/ai/mistake-classifier";
import { getSession } from "@/server/auth/session";

/**
 * app/api/chat/route.ts
 *
 * POST /api/chat
 *
 * This endpoint ONLY extracts a Study Report Draft from a natural-language
 * message and returns it to the client. It does not write to
 * LearningState, ConceptStats, Mistake, or any other authoritative table.
 * The client shows the draft in the same form Part 3 built for manual
 * entry; the user edits/confirms it there; the confirmed form is what
 * actually POSTs to /api/study-reports (Part 3), not this route.
 *
 * That separation is the whole point of Phase C: "The chatbot must not
 * directly mutate authoritative learning data."
 */

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  // Canonical subject names the client already has from the syllabus tree,
  // passed through so the extractor can ground its subject/unit mapping.
  knownSubjects: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: z.infer<typeof ChatRequestSchema>;
  try {
    body = ChatRequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const draft = await extractStudyReportDraft(body.message, {
    knownSubjects: body.knownSubjects,
  });

  if ("unavailable" in draft) {
    return NextResponse.json(
      { kind: "unavailable", reason: draft.reason },
      { status: 200 }
    );
  }

  return NextResponse.json({ kind: "draft", draft }, { status: 200 });
}

/**
 * POST /api/chat/mistake-suggestion
 * (co-located here for reference; move to its own route file if preferred)
 *
 * Same non-authoritative pattern: returns a suggested tag for the client
 * to pre-select in the one-tap tag UI. The user's tap is still what gets
 * persisted by mistake.service.ts.
 */
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

export async function suggestMistakeTagHandler(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
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
