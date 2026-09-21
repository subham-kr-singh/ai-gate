import { z } from "zod";
import { json, withUser } from "@/server/http/api";
import { answerDPPQuestion } from "@/server/domains/dpp/dpp.service";

export const dynamic = "force-dynamic";

/** MCQ: option id · MSQ: option ids · NAT: the typed numeric string. */
const body = z.object({
  questionId: z.string().min(1),
  selected: z.union([z.string().max(64), z.array(z.string().max(16)).max(8), z.null()]),
});

/** POST /api/dpp/[dppId]/answer — grade one DPP question, once. */
export const POST = withUser<{ dppId: string }>(async (userId, req, params) => {
  const parsed = body.parse(await req.json().catch(() => ({})));
  const result = await answerDPPQuestion({
    userId,
    dppId: params.dppId,
    questionId: parsed.questionId,
    selected: parsed.selected,
  });
  return json(result);
});
