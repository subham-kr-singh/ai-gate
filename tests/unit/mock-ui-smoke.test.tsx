// @vitest-environment jsdom
import { renderToString as render } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MockAnalytics } from '@/components/mocks/MockAnalytics';
import { MockPalette } from '@/components/mocks/MockPalette';
import { MockQuestionPane } from '@/components/mocks/MockQuestionPane';
import { MockReview } from '@/components/mocks/MockReview';
import { MockSimulator } from '@/components/mocks/MockSimulator';
import { MockTimer } from '@/components/mocks/MockTimer';
import { MockService } from '@/server/domains/tests/mock.service';
import { MemoryMockRepo, fakePorts } from '../helpers/mock-memory';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

async function finished() {
  const clock = () => Date.now();
  const repo = new MemoryMockRepo(clock);
  const svc = new MockService({ repo, ports: fakePorts().ports, now: clock, newSeed: () => 's' });
  const { id } = await svc.create('u');
  const ready = await svc.getSession('u', id);
  const running = await svc.start('u', id);
  const nat = running.questions.find((q) => q.type === 'NAT')!;
  const mcq = running.questions.find((q) => q.type === 'MCQ')!;
  await svc.applyEvents('u', id, [
    { seq: 1, questionId: nat.id, kind: 'SELECT', selected: '42', at: Date.now() },
    { seq: 2, questionId: mcq.id, kind: 'SELECT', selected: 'B', at: Date.now() },
    { seq: 3, questionId: mcq.id, kind: 'GUESS', at: Date.now() },
  ]);
  await svc.submit('u', id, { reason: 'USER' });
  return { ready, running, result: await svc.getResult('u', id) };
}

/** React SSR separates adjacent text nodes with <!-- --> markers; strip them for readable assertions. */
const renderToString = (el: Parameters<typeof render>[0]) => render(el).replace(/<!-- -->/g, '');

describe('UI components render with real data', () => {
  it('instructions screen', async () => {
    const { ready } = await finished();
    const html = renderToString(<MockSimulator snapshot={ready} />);
    expect(html).toContain('Begin mock');
    expect(html).toContain('65 questions');
    expect(html).toContain('General Aptitude');
  });

  it('exam screen shows the palette, a placeholder timer (no hydration mismatch) and no answer key', async () => {
    const { running } = await finished();
    const html = renderToString(<MockSimulator snapshot={running} />);
    expect(html).toContain('Submit mock');
    expect(html).toContain('-:--:--');
    expect(html).toContain('Question 1, ');
    expect(html).not.toContain('Solution q');
  });

  it('question pane renders MCQ, MSQ and NAT', async () => {
    const { running } = await finished();
    for (const type of ['MCQ', 'MSQ', 'NAT'] as const) {
      const q = running.questions.find((x) => x.type === type)!;
      const html = renderToString(
        <MockQuestionPane question={q} sectionLabel="Computer Science" answer={{ selected: null, markedForReview: false, guessed: false, visited: true }}
          disabled={false} onSelect={() => {}} onClear={() => {}} onToggleMark={() => {}} onToggleGuess={() => {}} />,
      );
      expect(html).toContain(`Question ${q.position}`);
      expect(html).toContain('Mark for review');
    }
  });

  it('palette and timer', async () => {
    const { running } = await finished();
    const html = renderToString(<MockPalette questions={running.questions} answers={running.answers} sections={running.sections} index={0} onGo={() => {}} />);
    expect(html).toContain('Not visited');
    expect(html).toContain('aria-current="true"');
    expect(renderToString(<MockTimer deadlineAtMs={Date.now() + 1000} getServerNow={Date.now} onExpire={() => {}} />)).toContain('role="timer"');
  });

  it('result analytics and review', async () => {
    const { result } = await finished();
    const a = renderToString(<MockAnalytics analytics={result.analytics} freshCount={result.freshCount} previousScoreShare={null} />);
    expect(a).toContain('Attempt rate');
    expect(a).toContain('Guessing');
    expect(a).not.toMatch(/rank|percentile/i);
    const r = renderToString(<MockReview mockId={result.id} rows={result.review} />);
    expect(r).toContain('Question review');
    expect(r).toContain('Why did this go wrong?');
  });
});
