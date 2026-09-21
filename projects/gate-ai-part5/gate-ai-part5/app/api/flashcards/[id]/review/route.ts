import { json, withUser } from "@/server/http/api";
import { reviewFlashcard, reviewSchema } from "@/server/domains/flashcards/flashcard.service";

/** POST /api/flashcards/:id/review  { grade: "again" | "hard" | "good" | "easy" } */
export const POST = withUser<{ id: string }>(async (userId, req, { id }) => {
  const { grade } = reviewSchema.parse(await req.json());
  const result = await reviewFlashcard(userId, id, grade);
  return result ? json(result) : json({ error: "That card no longer exists." }, { status: 404 });
});
