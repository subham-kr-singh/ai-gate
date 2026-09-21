import { json, withUser } from "@/server/http/api";
import { createFlashcard, createFlashcardSchema, getDueQueue } from "@/server/domains/flashcards/flashcard.service";

export const dynamic = "force-dynamic";

/** GET /api/flashcards?limit=20 — cards due now, with the next due date for each answer. */
export const GET = withUser(async (userId, req) => {
  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 20) || 20));
  return json(await getDueQueue(userId, limit));
});

export const POST = withUser(async (userId, req) => {
  const card = await createFlashcard(userId, createFlashcardSchema.parse(await req.json()));
  return json({ id: card.id }, { status: 201 });
});
