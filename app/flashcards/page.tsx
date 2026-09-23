import { FlashcardReviewer } from "@/components/flashcards/FlashcardReviewer";
import { NewFlashcardForm } from "@/components/flashcards/NewFlashcardForm";
import { AppShell } from "@/components/shell/AppShell";
import { requireUserId } from "@/server/auth/session";
import { getDueQueue } from "@/server/domains/flashcards/flashcard.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Flashcards" };

export default async function FlashcardsPage() {
  const userId = await requireUserId();
  const { cards, totalDue } = await getDueQueue(userId, 20);

  return (
    <AppShell
      aside={
        <div>
          <p className="mb-3 text-sm font-semibold">Add a card</p>
          <NewFlashcardForm />
        </div>
      }
    >
      <header>
        <h1 className="text-xl font-semibold">Flashcards</h1>
        <p className="text-sm text-slate">
          {totalDue === 0 ? "Nothing due" : `${totalDue} due${totalDue > cards.length ? `, showing the first ${cards.length}` : ""}`}
        </p>
      </header>
      <FlashcardReviewer key={cards.map((c) => c.id).join(",")} cards={cards} />
    </AppShell>
  );
}
