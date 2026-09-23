import { AppShell } from "@/components/shell/AppShell";
import { ReviewQueue } from "@/components/review/ReviewQueue";
import { requireUserId } from "@/server/auth/session";
import { listDrafts } from "@/server/domains/ingestion/review.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review" };

/**
 * Draft review queue (architecture §54, "Review / Publish").
 *
 * The pipeline stages extracted questions as drafts; this is where a human
 * decides which become real questions. Nothing here publishes on its own —
 * each row needs an explicit Approve.
 */
export default async function ReviewPage() {
  await requireUserId();
  const { drafts, summary } = await listDrafts({ limit: 100 });

  return (
    <AppShell active="review" width="wide">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Review</h1>
        <p className="text-sm text-slate">
          Extracted questions waiting on a decision. Approving one publishes it to the question bank.
        </p>
      </header>

      <ReviewQueue initialDrafts={drafts} initialSummary={summary} />
    </AppShell>
  );
}
