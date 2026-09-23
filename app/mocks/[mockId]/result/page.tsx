import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MockAnalytics } from '@/components/mocks/MockAnalytics';
import { MockReview } from '@/components/mocks/MockReview';
import { AppShell } from '@/components/shell/AppShell';
import { duration, marks, pct, shortDate } from '@/components/mocks/format';
import { getMockService } from '@/server/domains/tests/mock.context';
import { MockNotFoundError } from '@/server/domains/tests/mock.types';
import { userIdOrLogin } from '../../_lib';

export const dynamic = 'force-dynamic';

const SUBMIT_REASON_COPY: Record<string, string> = {
  USER: 'Submitted by you.',
  TIMER: 'Submitted automatically when the clock ran out.',
  EXPIRED_SERVER: 'Submitted automatically — the tab was closed past the deadline.',
};

export default async function MockResultPage({ params }: { params: Promise<{ mockId: string }> }) {
  const userId = await userIdOrLogin();
  const { mockId } = await params;

  const result = await getMockService()
    .getResult(userId, mockId)
    .catch((e) => {
      if (e instanceof MockNotFoundError) notFound();
      throw e;
    });

  const scorePct = result.analytics.score.share;
  const delta =
    result.previousScoreShare === null
      ? null
      : Math.round((scorePct - result.previousScoreShare) * 100);

  return (
    <AppShell active="mocks">
    <div className="mx-auto flex max-w-4xl flex-col gap-7">
      <header>
        <Link href="/mocks" className="text-sm text-slate underline-offset-2 hover:underline">
          ← Mocks
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-ink">{result.title}</h1>
        <p className="mt-1 text-sm text-slate">
          {shortDate(result.submittedAtMs)} · {result.questionCount} questions · {result.freshCount} unseen
        </p>
        <p className="mt-1 text-xs text-slate-light">{SUBMIT_REASON_COPY[result.submitReason] ?? ''}</p>
      </header>

      <section aria-label="Headline score" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[20px] bg-butter p-5">
          <p className="text-xs text-slate">Score</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {marks(result.analytics.score.obtained)}
            <span className="text-slate-light">/{marks(result.analytics.score.max)}</span>
          </p>
          <p className="mt-1 text-xs text-slate">{pct(scorePct)} of the paper</p>
        </div>

        <div className="rounded-[20px] bg-sky p-5">
          <p className="text-xs text-slate">Accuracy</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {result.analytics.accuracy === null ? '—' : pct(result.analytics.accuracy)}
          </p>
          <p className="mt-1 text-xs text-slate">
            across {result.analytics.counts.attempted} attempted
          </p>
        </div>

        <div className="rounded-[20px] bg-mint p-5">
          <p className="text-xs text-slate">Attempt rate</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {pct(result.analytics.attemptRate)}
          </p>
          <p className="mt-1 text-xs text-slate">
            {delta === null
              ? 'First submitted mock'
              : delta === 0
                ? 'Same as your last mock'
                : `${delta > 0 ? '+' : ''}${delta} pts vs your last mock`}
          </p>
        </div>
      </section>

      <MockAnalytics
        analytics={result.analytics}
        freshCount={result.freshCount}
        previousScoreShare={result.previousScoreShare}
      />

      <section aria-labelledby="review">
        <h2 id="review" className="mb-3 font-semibold text-ink">
          Question review
        </h2>
        <MockReview mockId={result.id} rows={result.review} />
      </section>
    </div>
    </AppShell>
  );
}