import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import { duration, marks, pct, shortDate } from '@/components/mocks/format';
import { NewMockButton } from '@/components/mocks/NewMockButton';
import { getMockService } from '@/server/domains/tests/mock.context';
import type { MockListItem } from '@/server/domains/tests/mock.types';
import { userIdOrLogin } from './_lib';

export const dynamic = 'force-dynamic';

export default async function MocksPage() {
  const userId = await userIdOrLogin();
  const listing = await getMockService().list(userId);
  const { readiness: r, active } = listing;
  const bp = listing.blueprints[0]!;

  return (
    <AppShell active="mocks">
      <div className="flex flex-col gap-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[#111111]">Mocks</h1>
            <p className="mt-1 text-sm text-[#77736D]">
              Full-length, exam-clock practice. Answers save as you go.
            </p>
          </div>
          <div className="w-56 text-right">
            <p className="text-sm text-[#77736D]">
              {r.completed} of {r.recommended} completed
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
              <div
                className="animate-fill-w h-full rounded-full bg-[#0E8074]"
                style={{ width: `${Math.min(1, r.completed / r.recommended) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {active && (
          <section className="rounded-[24px] bg-[#0E8074] p-7 text-white md:p-8">
            <h2 className="text-2xl font-semibold leading-[1.05]">{active.title} is running</h2>
            <p className="mt-2 max-w-md text-sm text-white/80">
              {active.deadlineAtMs && active.deadlineAtMs > listing.serverNowMs
                ? `${duration((active.deadlineAtMs - listing.serverNowMs) / 1000)} left on the clock. Your answers are saved.`
                : 'Time is up. Open it to finish and see your result.'}
            </p>
            <Link href={`/mocks/${active.id}`} className="mt-5 inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-medium text-[#111111]">
              Resume
            </Link>
          </section>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[20px] border border-[#E3E0DA] p-5">
            <h2 className="font-semibold text-[#111111]">{bp.title}</h2>
            <p className="mt-1 text-sm text-[#77736D]">
              {duration(bp.durationSec)} · {bp.totalQuestions} questions · {bp.totalMarks} marks
            </p>
            {listing.ready.length > 0 && (
              <ul className="mt-4 flex flex-col divide-y divide-[#E3E0DA] text-sm">
                {listing.ready.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-3">
                    <span className="text-[#111111]">
                      {m.title} <span className="text-[#77736D]">· built {shortDate(m.createdAtMs)} · {m.freshCount} new questions</span>
                    </span>
                    <Link href={`/mocks/${m.id}`} className="font-medium text-[#111111] underline underline-offset-2">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-[20px] border border-[#E3E0DA] p-5">
            <NewMockButton blueprintKey={bp.key} disabled={!!active} />
            {active && <p className="mt-3 text-xs text-[#77736D]">Finish the running mock before starting another.</p>}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-[#111111]">History</h2>
            {r.averageScoreShare !== null && (
              <span className="text-sm text-[#77736D]">Average score {pct(r.averageScoreShare)}</span>
            )}
          </div>
          {listing.history.length === 0 ? (
            <p className="rounded-[20px] border border-[#E3E0DA] p-5 text-sm text-[#77736D]">
              No submitted mocks yet. Your first result will show here.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[#E3E0DA] rounded-[20px] border border-[#E3E0DA]">
              {listing.history.map((m) => (
                <HistoryRow key={m.id} m={m} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function HistoryRow({ m }: { m: MockListItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <div>
        <p className="font-medium text-[#111111]">{m.title}</p>
        <p className="text-xs text-[#77736D]">{m.submittedAtMs ? shortDate(m.submittedAtMs) : ''}</p>
      </div>
      <p className="text-[#3a3a3a]">
        <span className="font-semibold text-[#111111]">
          {m.score === null ? '–' : marks(m.score)} / {m.maxMarks}
        </span>
        {' · '}accuracy {pct(m.accuracy)}
        {' · '}attempted {pct(m.attemptRate)}
      </p>
      <Link href={`/mocks/${m.id}/result`} className="font-medium text-[#111111] underline underline-offset-2">
        View result
      </Link>
    </li>
  );
}
