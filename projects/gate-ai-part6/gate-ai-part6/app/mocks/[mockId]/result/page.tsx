import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { duration, shortDate } from '@/components/mocks/format';
import { MockAnalytics } from '@/components/mocks/MockAnalytics';
import { MockReview } from '@/components/mocks/MockReview';
import { getMockService } from '@/server/domains/tests/mock.context';
import { MockNotFoundError, MockStateError, type MockResultView } from '@/server/domains/tests/mock.types';
import { userIdOrLogin } from '../../_lib';

export const dynamic = 'force-dynamic';

const REASON = {
  USER: 'Submitted by you',
  TIMER: 'Submitted when time ran out',
  EXPIRED_SERVER: 'Submitted automatically after time ran out',
} as const;

export default async function MockResultPage({ params }: { params: Promise<{ mockId: string }> }) {
  const { mockId } = await params;
  const userId = await userIdOrLogin();

  let result: MockResultView;
  try {
    result = await getMockService().getResult(userId, mockId);
  } catch (e) {
    if (e instanceof MockNotFoundError) notFound();
    if (e instanceof MockStateError) redirect(`/mocks/${mockId}`);
    throw e;
  }

  return (
    <div className="min-h-screen bg-[#F8F6F2] px-6 py-10 md:px-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div>
          <Link href="/mocks" className="text-sm text-[#77736D] underline-offset-2 hover:underline">
            All mocks
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-[#111111]">{result.title}</h1>
          <p className="mt-1 text-sm text-[#77736D]">
            {shortDate(result.submittedAtMs)} · {REASON[result.submitReason]} · {duration(result.analytics.time.usedSec)} used
          </p>
        </div>

        <MockAnalytics analytics={result.analytics} freshCount={result.freshCount} previousScoreShare={result.previousScoreShare} />
        <MockReview mockId={result.id} rows={result.review} />
      </div>
    </div>
  );
}
