// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMockSession } from '@/components/mocks/useMockSession';
import { MockService } from '@/server/domains/tests/mock.service';
import type { MockSessionSnapshot } from '@/server/domains/tests/mock.types';
import { MemoryMockRepo, fakePorts } from '../helpers/mock-memory';

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));

const USER = 'u1';
const SERVER_SKEW = 5_000; // server clock runs 5s ahead of this "device"

interface Harness {
  svc: MockService;
  repo: MemoryMockRepo;
  snapshot: MockSessionSnapshot;
  id: string;
  net: { fail: number; calls: string[] };
}

async function harness(): Promise<Harness> {
  const clock = () => Date.now() + SERVER_SKEW;
  const repo = new MemoryMockRepo(clock);
  const fp = fakePorts();
  const svc = new MockService({ repo, ports: fp.ports, now: clock, newSeed: () => 'seed' });
  const { id } = await svc.create(USER);
  const snapshot = await svc.start(USER, id);

  const net = { fail: 0, calls: [] as string[] };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    net.calls.push(url);
    if (net.fail > 0) {
      net.fail--;
      throw new TypeError('network down');
    }
    const body = JSON.parse(String(init.body ?? '{}'));
    const path = url.split('/').pop();
    if (path === 'answer') return Response.json(await svc.applyEvents(USER, id, body.events));
    if (path === 'submit') return Response.json(await svc.submit(USER, id, body));
    return new Response('nope', { status: 404 });
  });
  return { svc, repo, snapshot, id, net };
}

/** Let timers and microtasks run without consuming real time. */
async function settle(ms = 400) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  localStorage.clear();
  nav.replace.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useMockSession against the real service', () => {
  it('autosaves an answer with a monotonic seq and shows it as saved', async () => {
    const h = await harness();
    const q = h.snapshot.questions.find((x) => x.type === 'MCQ')!;
    const { result } = renderHook(() => useMockSession(h.snapshot));
    await settle();

    act(() => result.current.select(q.id, 'B'));
    expect(result.current.answers[q.id]!.selected).toBe('B'); // optimistic
    await settle();

    expect(h.repo.states.get(h.id)!.get(q.id)!.selected).toBe('B');
    expect(result.current.saveState).toBe('saved');
    expect(result.current.pending).toBe(0);
  });

  it('calibrates its clock to the server (device is 5s behind)', async () => {
    const h = await harness();
    const { result } = renderHook(() => useMockSession(h.snapshot));
    await settle();
    const drift = result.current.serverNow() - (Date.now() + SERVER_SKEW);
    expect(Math.abs(drift)).toBeLessThan(500);
  });

  it('keeps unsent answers through a network outage and delivers them when it returns', async () => {
    const h = await harness();
    const q = h.snapshot.questions.find((x) => x.type === 'MCQ')!;
    const { result } = renderHook(() => useMockSession(h.snapshot));
    await settle();

    h.net.fail = 3;
    act(() => result.current.select(q.id, 'C'));
    await settle(300);
    expect(['offline', 'error']).toContain(result.current.saveState);
    expect(result.current.pending).toBeGreaterThan(0);
    expect(h.repo.states.get(h.id)!.get(q.id)?.selected ?? null).toBeNull();

    await settle(30_000); // backoff retries
    expect(h.repo.states.get(h.id)!.get(q.id)!.selected).toBe('C');
    expect(result.current.saveState).toBe('saved');
  });

  it('a refresh with unsent events loses nothing: the outbox replays into a fresh session', async () => {
    const h = await harness();
    const q = h.snapshot.questions.find((x) => x.type === 'MCQ')!;
    const first = renderHook(() => useMockSession(h.snapshot));
    await settle();

    h.net.fail = 1000; // fully offline, then the page is refreshed
    act(() => first.result.current.select(q.id, 'D'));
    await settle(300);
    first.unmount();
    expect(localStorage.getItem(`gateai:mock:${h.id}:outbox`)).toContain('"SELECT"');

    h.net.fail = 0;
    const server = await h.svc.getSession(USER, h.id); // what SSR would hand the reloaded page
    const second = renderHook(() => useMockSession(server));
    expect(server.answers[q.id]!.selected).toBeNull(); // the server never saw it
    await settle(); // the outbox is restored…
    expect(second.result.current.answers[q.id]!.selected).toBe('D'); // …optimistically
    await settle(600);
    expect(h.repo.states.get(h.id)!.get(q.id)!.selected).toBe('D'); // …and delivers it
  });

  it('debounces NAT typing into one saved value', async () => {
    const h = await harness();
    const q = h.snapshot.questions.find((x) => x.type === 'NAT')!;
    const { result } = renderHook(() => useMockSession(h.snapshot));
    await settle();

    const before = h.net.calls.length;
    for (const v of ['4', '42']) act(() => result.current.select(q.id, v, true));
    expect(result.current.answers[q.id]!.selected).toBe('42');
    await settle(1500);
    expect(h.repo.states.get(h.id)!.get(q.id)!.selected).toBe('42');
    const selects = [...h.repo.seqs.get(h.id)!].length;
    expect(selects).toBeLessThan(6);
    expect(h.net.calls.length - before).toBeLessThan(4);
  });

  it('captures the first answer only when the student leaves the question', async () => {
    const h = await harness();
    const [q1] = h.snapshot.questions;
    const { result } = renderHook(() => useMockSession(h.snapshot));
    await settle();

    act(() => result.current.select(q1!.id, q1!.type === 'MSQ' ? ['A'] : q1!.type === 'NAT' ? '7' : 'A'));
    await settle();
    expect(h.repo.states.get(h.id)!.get(q1!.id)!.firstAnswer).toBeNull();
    act(() => result.current.goTo(1));
    await settle();
    expect(h.repo.states.get(h.id)!.get(q1!.id)!.firstAnswer).not.toBeNull();
    expect(result.current.index).toBe(1);
  });

  it('submit sends the outbox with it, lands on the result page and grades on the server', async () => {
    const h = await harness();
    const q = h.snapshot.questions.find((x) => x.type === 'NAT')!;
    const { result } = renderHook(() => useMockSession(h.snapshot));
    await settle();

    h.net.fail = 1; // the autosave for this answer fails…
    act(() => result.current.select(q.id, '42', false));
    await settle(300);
    await act(async () => {
      const p = result.current.submit('USER'); // …but the submit request carries it
      await vi.advanceTimersByTimeAsync(5_000);
      await p;
    });

    expect(nav.replace).toHaveBeenCalledWith(`/mocks/${h.id}/result`);
    const res = await h.svc.getResult(USER, h.id);
    expect(res.analytics.counts.correct).toBe(1);
  });

  it('follows the server when the mock was submitted elsewhere (other tab / server expiry)', async () => {
    const h = await harness();
    const { result } = renderHook(() => useMockSession(h.snapshot));
    await settle();
    await h.svc.submit(USER, h.id, { reason: 'USER' });
    await settle(50_000); // next heartbeat notices
    expect(nav.replace).toHaveBeenCalledWith(`/mocks/${h.id}/result`);
    expect(result.current.phase).toBe('done');
  });
});
