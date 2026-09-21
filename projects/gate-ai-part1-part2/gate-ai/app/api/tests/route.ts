import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/server/auth/require";
import { startTest } from "@/server/domains/tests/test.service";
import { searchQuestions } from "@/server/domains/questions/question.service";

const startTestSchema = z.object({
  type: z.enum(["TOPIC_QUIZ", "MOCK"]).default("TOPIC_QUIZ"),
  examYear: z.number().int(),
  title: z.string().min(1),
  // Either pass explicit questionIds, or a filter + count and let the
  // server pick (topic-quiz launcher flow).
  questionIds: z.array(z.string()).optional(),
  filter: z
    .object({
      unitId: z.string().optional(),
      topicId: z.string().optional(),
      subjectId: z.string().optional(),
      count: z.number().int().positive().max(100).default(10),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = startTestSchema.parse(body);

    let questionIds = parsed.questionIds ?? [];
    if (questionIds.length === 0 && parsed.filter) {
      const found = await searchQuestions({
        unitId: parsed.filter.unitId,
        topicId: parsed.filter.topicId,
        subjectId: parsed.filter.subjectId,
        limit: parsed.filter.count,
        status: "APPROVED",
      });
      questionIds = found.map((q) => q.id);
    }

    if (questionIds.length === 0) {
      return NextResponse.json(
        { error: "No questions available for the given selection." },
        { status: 400 }
      );
    }

    const test = await startTest({
      userId: user.id,
      type: parsed.type,
      examYear: parsed.examYear,
      title: parsed.title,
      questionIds,
    });

    return NextResponse.json({ test });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start test." },
      { status: 400 }
    );
  }
}
