import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getExplanation } from "@/server/domains/ai/explanation.service";

/**
 * POST /api/explain
 *
 * Wires the previously unwired explanation service into the product. The
 * request names an answer the student actually gave; the server loads that
 * question's trusted solution and the student's recent mistake pattern itself,
 * so the client cannot ask the model to explain arbitrary text.
 *
 * Explanations are advisory — never used for grading (architecture §44).
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({ answerId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "answerId is required" }, { status: 400 });

  const answer = await db.answer.findFirst({
    where: { id: parsed.data.answerId, userId: user.id },
    include: { question: true },
  });
  if (!answer) return NextResponse.json({ error: "answer not found" }, { status: 404 });

  const question = answer.question;
  if (!question.solution?.trim()) {
    return NextResponse.json(
      { unavailable: true, reason: "This question has no trusted solution on file to explain from." },
      { status: 200 },
    );
  }

  const recentMistakes = await db.mistake.findMany({
    where: { userId: user.id, resolved: false, mistakeType: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { mistakeType: true },
  });

  const result = await getExplanation({
    questionId: question.id,
    statement: question.statement,
    trustedSolution: question.solution,
    relevantConcepts: [],
    studentSelectedAnswer: JSON.stringify(answer.selectedAnswer),
    correctAnswer: JSON.stringify(question.correctAnswer),
    recentMistakeTypes: recentMistakes.map((m) => String(m.mistakeType)),
  });

  return NextResponse.json(result, { status: 200 });
}
