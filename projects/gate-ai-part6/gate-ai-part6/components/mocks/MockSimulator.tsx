'use client';

import { ChevronLeft, ChevronRight, LayoutGrid, Check, WifiOff, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientAnswerState, MockSessionSnapshot } from '@/server/domains/tests/mock.types';
import { duration } from './format';
import { MockPalette, statusOf } from './MockPalette';
import { MockQuestionPane } from './MockQuestionPane';
import { MockTimer } from './MockTimer';
import { useMockSession, type SaveState } from './useMockSession';

/**
 * Full-bleed exam surface (design.md §1): no outer frame, hairline dividers, teal = progress,
 * amber = urgent. The left nav rail is intentionally absent — exam focus mode.
 */

export function MockSimulator({ snapshot }: { snapshot: MockSessionSnapshot }) {
  return snapshot.status === 'READY' ? <Instructions snapshot={snapshot} /> : <Exam snapshot={snapshot} />;
}

// ── before the clock starts ──────────────────────────────────────────────────

function Instructions({ snapshot }: { snapshot: MockSessionSnapshot }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; activeId?: string } | null>(null);
  const totalQ = snapshot.sections.reduce((n, s) => n + s.count, 0);
  const totalMarks = snapshot.sections.reduce((n, s) => n + s.maxMarks, 0);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mocks/${snapshot.id}/start`, { method: 'POST' });
      if (res.ok) return router.refresh();
      const body = (await res.json().catch(() => null)) as { error?: { message?: string; activeMockId?: string } } | null;
      setError({ message: body?.error?.message ?? 'Could not start the mock.', activeId: body?.error?.activeMockId });
    } catch {
      setError({ message: 'Network problem. Nothing has started; try again.' });
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-[#F8F6F2] px-6 py-12 md:px-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <div>
          <Link href="/mocks" className="text-sm text-[#77736D] underline-offset-2 hover:underline">
            Back to mocks
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-[#111111]">{snapshot.title}</h1>
          <p className="mt-1 text-sm text-[#77736D]">
            {duration(snapshot.durationSec)} · {totalQ} questions · {totalMarks} marks
          </p>
        </div>

        <ul className="flex flex-col divide-y divide-[#E3E0DA] rounded-[20px] border border-[#E3E0DA]">
          {snapshot.sections.map((s) => (
            <li key={s.key} className="flex items-center justify-between p-5 text-sm">
              <span className="font-medium text-[#111111]">{s.label}</span>
              <span className="text-[#77736D]">
                {s.count} questions · {s.maxMarks} marks
              </span>
            </li>
          ))}
        </ul>

        <section className="rounded-[20px] border border-[#E3E0DA] p-5">
          <h2 className="mb-3 font-semibold text-[#111111]">Marking</h2>
          <ul className="flex flex-col gap-2 text-sm text-[#3a3a3a]">
            {snapshot.markingRules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-[20px] border border-[#E3E0DA] p-5">
          <h2 className="mb-3 font-semibold text-[#111111]">How the clock works</h2>
          <ul className="flex flex-col gap-2 text-sm text-[#3a3a3a]">
            <li>The timer starts when you press Begin and runs on the server, not in this tab.</li>
            <li>If your phone locks or you refresh, your answers and the true remaining time are restored.</li>
            <li>Answers save as you go. When time is up, the mock submits itself.</li>
            <li>Full mocks work best on a laptop. A phone is fine as a fallback.</li>
          </ul>
        </section>

        {error && (
          <p role="alert" className="rounded-[20px] bg-[#F4DEB4] p-4 text-sm text-[#111111]">
            {error.message}{' '}
            {error.activeId && (
              <Link href={`/mocks/${error.activeId}`} className="font-medium underline">
                Go to the running mock
              </Link>
            )}
          </p>
        )}

        <button
          type="button"
          onClick={begin}
          disabled={busy}
          className="h-12 rounded-full bg-[#111111] text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? 'Starting…' : 'Begin mock'}
        </button>
      </div>
    </div>
  );
}

// ── the exam ─────────────────────────────────────────────────────────────────

function Exam({ snapshot }: { snapshot: MockSessionSnapshot }) {
  const s = useMockSession(snapshot);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const q = snapshot.questions[s.index]!;
  const total = snapshot.questions.length;
  const locked = s.phase !== 'running';
  const currentSection = snapshot.sections.find((x) => x.key === q.section)!;

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (submitOpen && !d.open) d.showModal();
    if (!submitOpen && d.open) d.close();
  }, [submitOpen]);

  const summary = useMemo(() => {
    return snapshot.sections.map((sec) => {
      const c = { answered: 0, notAnswered: 0, marked: 0, notVisited: 0 };
      for (const question of snapshot.questions.filter((x) => x.section === sec.key)) {
        const a: ClientAnswerState | undefined = s.answers[question.id];
        const st = statusOf(a);
        if (st === 'answered' || st === 'answeredMarked') c.answered++;
        else if (st === 'notVisited') c.notVisited++;
        else c.notAnswered++;
        if (a?.markedForReview) c.marked++;
      }
      return { sec, ...c };
    });
  }, [s.answers, snapshot.questions, snapshot.sections]);

  const palette = (
    <MockPalette
      questions={snapshot.questions}
      answers={s.answers}
      sections={snapshot.sections}
      index={s.index}
      onGo={(i) => {
        s.goTo(i);
        setPaletteOpen(false);
      }}
    />
  );

  return (
    <div className="grid min-h-screen grid-cols-1 bg-[#F8F6F2] lg:grid-cols-[minmax(0,1fr)_320px]">
      <main className="flex min-h-screen flex-col border-[#E3E0DA] lg:border-r">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3E0DA] px-6 py-4 md:px-10">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-base font-semibold text-[#111111]">{snapshot.title}</h1>
            <nav aria-label="Sections" className="flex gap-2">
              {snapshot.sections.map((sec) => (
                <button
                  key={sec.key}
                  type="button"
                  onClick={() => s.goTo(sec.firstPosition - 1)}
                  aria-current={sec.key === q.section ? 'true' : undefined}
                  className={`h-9 rounded-full px-4 text-sm ${
                    sec.key === q.section ? 'bg-[#111111] text-white' : 'bg-[#ECE9E3] text-[#222222]'
                  }`}
                >
                  {sec.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <SaveStatus state={s.saveState} pending={s.pending} />
            <MockTimer
              deadlineAtMs={snapshot.deadlineAtMs!}
              getServerNow={s.serverNow}
              onExpire={() => void s.submit('TIMER')}
            />
          </div>
        </header>

        <div className="flex-1 px-6 py-8 md:px-10">
          <MockQuestionPane
            key={q.id}
            question={q}
            sectionLabel={currentSection.label}
            answer={s.answers[q.id]!}
            disabled={locked}
            onSelect={(v, debounce) => s.select(q.id, v, debounce)}
            onClear={() => s.clear(q.id)}
            onToggleMark={() => s.toggleMark(q.id)}
            onToggleGuess={() => s.toggleGuess(q.id)}
          />
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[#E3E0DA] bg-[#F8F6F2] px-6 py-4 md:px-10">
          <button
            type="button"
            onClick={s.prev}
            disabled={locked || s.index === 0}
            className="inline-flex h-10 items-center gap-1 rounded-full bg-[#ECE9E3] pl-3 pr-4 text-sm text-[#222222] disabled:opacity-50"
          >
            <ChevronLeft size={16} aria-hidden /> Previous
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ECE9E3] px-4 text-sm text-[#222222] lg:hidden"
          >
            <LayoutGrid size={15} aria-hidden /> {s.index + 1} / {total}
          </button>
          <span className="hidden text-sm text-[#77736D] lg:inline">
            {s.index + 1} of {total}
          </span>

          <button
            type="button"
            onClick={s.next}
            disabled={locked || s.index === total - 1}
            className="inline-flex h-10 items-center gap-1 rounded-full bg-[#111111] pl-4 pr-3 text-sm text-white disabled:opacity-50"
          >
            Next <ChevronRight size={16} aria-hidden />
          </button>
        </footer>
      </main>

      <aside className="hidden flex-col gap-6 p-6 lg:flex">
        {palette}
        <button
          type="button"
          onClick={() => setSubmitOpen(true)}
          disabled={locked}
          className="h-10 rounded-full bg-[#111111] text-sm text-white disabled:opacity-60"
        >
          Submit mock
        </button>
      </aside>

      {paletteOpen && (
        <div role="dialog" aria-modal="true" aria-label="Question palette" className="fixed inset-0 z-40 flex items-end bg-black/40 lg:hidden">
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-[24px] border-t border-[#E3E0DA] bg-[#F8F6F2] p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold text-[#111111]">Questions</p>
              <button type="button" onClick={() => setPaletteOpen(false)} aria-label="Close palette" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ECE9E3]">
                <X size={16} aria-hidden />
              </button>
            </div>
            {palette}
            <button
              type="button"
              onClick={() => {
                setPaletteOpen(false);
                setSubmitOpen(true);
              }}
              disabled={locked}
              className="mt-6 h-10 w-full rounded-full bg-[#111111] text-sm text-white disabled:opacity-60"
            >
              Submit mock
            </button>
          </div>
        </div>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setSubmitOpen(false)}
        aria-labelledby="submit-h"
        className="w-[min(92vw,32rem)] rounded-[24px] border border-[#E3E0DA] bg-[#F8F6F2] p-0 backdrop:bg-black/40"
      >
        <div className="flex flex-col gap-5 p-6">
          <h2 id="submit-h" className="text-lg font-semibold text-[#111111]">
            Submit this mock?
          </h2>
          <ul className="flex flex-col divide-y divide-[#E3E0DA] rounded-[20px] border border-[#E3E0DA] bg-white text-sm">
            {summary.map((r) => (
              <li key={r.sec.key} className="p-4">
                <p className="font-medium text-[#111111]">{r.sec.label}</p>
                <p className="mt-1 text-[#3a3a3a]">
                  {r.answered} answered · {r.notAnswered} not answered · {r.notVisited} not visited · {r.marked} marked for review
                </p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-[#77736D]">You cannot change answers after submitting.</p>
          {s.phase === 'submitError' && (
            <p role="alert" className="rounded-[20px] bg-[#F4DEB4] p-3 text-sm text-[#111111]">
              Could not reach the server. Your answers are saved on this device. Try again.
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setSubmitOpen(false)} className="h-10 flex-1 rounded-full bg-[#ECE9E3] text-sm text-[#222222]">
              Keep working
            </button>
            <button
              type="button"
              onClick={() => void s.submit('USER')}
              disabled={s.phase === 'submitting'}
              className="h-10 flex-1 rounded-full bg-[#111111] text-sm text-white disabled:opacity-60"
            >
              {s.phase === 'submitting' ? 'Submitting…' : 'Submit mock'}
            </button>
          </div>
        </div>
      </dialog>

      {(s.phase === 'expired' || s.phase === 'done' || (s.phase === 'submitError' && !submitOpen)) && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="timeup-h" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-md rounded-[24px] border border-[#E3E0DA] bg-[#F8F6F2] p-6">
            <h2 id="timeup-h" className="text-lg font-semibold text-[#111111]">
              {s.phase === 'done' ? 'Submitted' : "Time's up"}
            </h2>
            <p className="mt-2 text-sm text-[#3a3a3a]">
              {s.phase === 'submitError'
                ? 'We could not submit yet. Your answers are saved. If this persists, the server will submit the mock for you.'
                : s.phase === 'done'
                  ? 'Opening your result…'
                  : 'Submitting your answers…'}
            </p>
            {s.phase === 'submitError' && (
              <button type="button" onClick={() => void s.submit('TIMER')} className="mt-4 h-10 w-full rounded-full bg-[#111111] text-sm text-white">
                Try again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SaveStatus({ state, pending }: { state: SaveState; pending: number }) {
  const bad = state === 'offline' || state === 'error';
  return (
    <p
      role="status"
      aria-live="polite"
      className={`hidden items-center gap-1.5 text-xs sm:flex ${bad ? 'rounded-full bg-[#D98E2B] px-3 py-1.5 font-medium text-[#111111]' : 'text-[#77736D]'}`}
    >
      {bad ? <WifiOff size={13} aria-hidden /> : state === 'saved' ? <Check size={13} aria-hidden /> : null}
      {state === 'saved' && 'Saved'}
      {state === 'saving' && 'Saving…'}
      {state === 'offline' && `Offline. ${pending} unsent, retrying`}
      {state === 'error' && `Retrying. ${pending} unsent`}
    </p>
  );
}
