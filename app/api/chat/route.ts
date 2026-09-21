import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractStudyReportDraft } from "@/server/domains/ai/study-report-extractor";
import { suggestMistakeTag } from "@/server/domains/ai/mistake-classifier";
import { getSessionEmail } from "@/server/auth/session";

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
  const email = getSessionEmail();
  if (!email) {
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
