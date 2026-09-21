import type { GroupRow, MockAnalytics as Analytics } from '@/server/domains/tests/mock.types';
import { duration, marks, pct } from './format';

/**
 * Result analytics (architecture §66). Server-renderable: no hooks, no client state.
 *
 * Honesty rules baked in:
 *  • No rank, percentile or predicted score — evidence, not exam outcomes (§33).
 *  • A 65-question paper gives tiny per-unit samples. Rows under MIN_SAMPLE questions are
 *    shown as "small sample" and never judged weak or strong.
 *  • Teal = better than this mock's overall, amber = clearly below it (design.md §2).
 */

const MIN_SAMPLE = 3;

interface Props {
  analytics: Analytics;
  freshCount: number;
  previousScoreShare: number | null;
}

export function MockAnalytics({ analytics: a, freshCount, previousScoreShare }: Props) {
  const delta = previousScoreShare === null ? null : (a.score.share - previousScoreShare) * 100;
  const changes = a.answerChanges;
  const weakUnits = a.byUnit.filter((r) => r.total >= MIN_SAMPLE || r.marksAvailable >= 4).slice(0, 5);

  return (
    <div className="flex flex-col gap-7">
      {/* headline tiles — same anatomy as the dashboard stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile fill="#F4DEB4" label="Score" value={`${marks(a.score.obtained)} / ${a.score.max}`}
          delta={delta === null ? null : { text: `${delta >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(delta))} pts`, good: delta >= 0 }}
          note={a.score.negative > 0 ? `Negative marking cost ${marks(a.score.negative)}` : 'No marks lost to negative marking'} />
        <Tile fill="#C7E3F5" label="Accuracy" value={pct(a.accuracy)}
          note={`${a.counts.correct} correct · ${a.counts.wrong} wrong`} />
        <Tile fill="#D0CCF4" label="Attempt rate" value={`${a.counts.attempted} / ${a.counts.total}`}
          note={`${a.counts.unanswered} left blank`} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Time">
          <Row k="Used" v={`${duration(a.time.usedSec)} of ${duration(a.time.allottedSec)}`} />
          <Row k="Left unused" v={duration(a.time.unusedSec)} />
          <Row k="Average per attempted question" v={a.time.avgSecPerAttempted === null ? '–' : duration(a.time.avgSecPerAttempted)} />
          <Row k="Time lost" v={duration(a.time.timeLostSec)} hint="Time beyond the per-mark budget on questions that earned no marks." tone={a.time.timeLostSec > 600 ? 'weak' : undefined} />
        </Card>

        <Card title="Did changing answers help?">
          {changes.changedCount === 0 ? (
            <p className="text-sm text-[#77736D]">You did not change any answers.</p>
          ) : (
            <>
              <Row k="Answers changed" v={String(changes.changedCount)} />
              <Row k="Wrong to right" v={String(changes.wrongToRight)} tone={changes.wrongToRight > 0 ? 'good' : undefined} />
              <Row k="Right to wrong" v={String(changes.rightToWrong)} tone={changes.rightToWrong > 0 ? 'weak' : undefined} />
              <Row k="Net effect on marks" v={`${changes.netMarks >= 0 ? '+' : ''}${marks(changes.netMarks)}`}
                tone={changes.netMarks > 0 ? 'good' : changes.netMarks < 0 ? 'weak' : undefined} />
            </>
          )}
          <Row k="First-attempt accuracy" v={pct(changes.firstAttemptAccuracy)} hint="Accuracy of the answer you committed when you first left each question." />
        </Card>

        <Card title="Guessing">
          {a.guessing.guessedAttempted === 0 ? (
            <p className="text-sm text-[#77736D]">You did not flag any answers as guesses.</p>
          ) : (
            <>
              <Row k="Answered as a guess" v={`${a.guessing.guessedAttempted} (${pct(a.guessing.guessRate)} of attempts)`} />
              <Row k="Guess accuracy" v={pct(a.guessing.guessAccuracy)} />
              <Row k="Net marks from guesses" v={`${a.guessing.netMarks >= 0 ? '+' : ''}${marks(a.guessing.netMarks)}`}
                tone={a.guessing.netMarks > 0 ? 'good' : a.guessing.netMarks < 0 ? 'weak' : undefined}
                hint="After negative marking. Positive means guessing paid off this time." />
            </>
          )}
        </Card>

        <Card title="Marked for review">
          {a.reviewed.marked === 0 ? (
            <p className="text-sm text-[#77736D]">You did not mark any questions.</p>
          ) : (
            <>
              <Row k="Marked" v={`${a.reviewed.marked} (${a.reviewed.markedAttempted} answered)`} />
              <Row k="Accuracy on marked questions" v={pct(a.reviewed.accuracy)}
                hint={a.accuracy !== null && a.reviewed.accuracy !== null ? `Overall accuracy was ${pct(a.accuracy)}.` : undefined} />
            </>
          )}
        </Card>
      </div>

      {weakUnits.length > 0 && (
        <section className="rounded-[20px] border border-[#E3E0DA] p-5">
          <h3 className="mb-3 font-semibold text-[#111111]">Needs attention</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {weakUnits.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-4">
                <span className="text-[#111111]">{r.label}</span>
                <span className={judge(r, a.score.share) === 'weak' ? 'text-[#D98E2B]' : 'text-[#77736D]'}>
                  {marks(r.marksObtained)} / {r.marksAvailable} marks
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[#77736D]">
            A single paper samples each unit only a few times. Treat these as signals to check against your practice data, not verdicts.
          </p>
        </section>
      )}

      <Breakdown title="By section" rows={a.bySection} overall={a.score.share} />
      <Breakdown title="By subject" rows={a.bySubject} overall={a.score.share} />
      <Breakdown title="By question type" rows={a.byType} overall={a.score.share} />
      <Breakdown title="By marks" rows={a.byMarks} overall={a.score.share} />

      <p className="text-xs text-[#77736D]">
        {freshCount} of {a.counts.total} questions in this mock were new to you, so it is independent evidence of what you can solve unseen.
      </p>
    </div>
  );
}

function judge(r: GroupRow, overall: number): 'weak' | 'good' | 'small' | 'even' {
  if (r.total < MIN_SAMPLE) return 'small';
  if (r.scoreShare < overall - 0.1) return 'weak';
  if (r.scoreShare > overall + 0.1) return 'good';
  return 'even';
}

function Tile(props: { fill: string; label: string; value: string; note: string; delta?: { text: string; good: boolean } | null }) {
  return (
    <div className="rounded-[20px] p-5" style={{ backgroundColor: props.fill }}>
      <p className="text-xs text-[#3a3a3a]">{props.label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-semibold text-[#111111]">{props.value}</p>
        {props.delta && (
          <span className={`text-xs font-medium ${props.delta.good ? 'text-[#0E8074]' : 'text-[#D98E2B]'}`}>{props.delta.text}</span>
        )}
      </div>
      <p className="mt-1 text-xs text-[#3a3a3a]">{props.note}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-[#E3E0DA] p-5">
      <h3 className="mb-3 font-semibold text-[#111111]">{title}</h3>
      <dl className="flex flex-col gap-3">{children}</dl>
    </section>
  );
}

function Row({ k, v, hint, tone }: { k: string; v: string; hint?: string; tone?: 'good' | 'weak' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <dt className="text-[#3a3a3a]">{k}</dt>
        <dd className={`font-medium ${tone === 'good' ? 'text-[#0E8074]' : tone === 'weak' ? 'text-[#D98E2B]' : 'text-[#111111]'}`}>{v}</dd>
      </div>
      {hint && <p className="mt-0.5 text-xs text-[#77736D]">{hint}</p>}
    </div>
  );
}

function Breakdown({ title, rows, overall }: { title: string; rows: GroupRow[]; overall: number }) {
  return (
    <section className="rounded-[20px] border border-[#E3E0DA] p-5">
      <h3 className="mb-3 font-semibold text-[#111111]">{title}</h3>
      <ul className="flex flex-col divide-y divide-[#E3E0DA]">
        {rows.map((r) => {
          const j = judge(r, overall);
          return (
            <li key={r.key} className="py-3">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-[#111111]">{r.label}</span>
                <span className="shrink-0 text-[#111111]">
                  {marks(r.marksObtained)} / {r.marksAvailable}
                  <span
                    className={`ml-2 text-xs ${j === 'weak' ? 'text-[#D98E2B]' : j === 'good' ? 'text-[#0E8074]' : 'text-[#77736D]'}`}
                  >
                    {j === 'weak' ? 'Below your average' : j === 'good' ? 'Above your average' : j === 'small' ? 'Small sample' : ''}
                  </span>
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10" aria-hidden>
                <div className="animate-fill-w h-full rounded-full bg-[#0E8074]" style={{ width: `${Math.max(0, Math.min(1, r.scoreShare)) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-[#77736D]">
                {r.correct} correct · {r.wrong} wrong · {r.unanswered} blank · accuracy {pct(r.accuracy)}
                {r.negativeMarks > 0 ? ` · −${marks(r.negativeMarks)} negative` : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
