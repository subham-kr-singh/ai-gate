'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function NewMockButton({ blueprintKey, disabled }: { blueprintKey: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [preferUnseen, setPreferUnseen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/mocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintKey, preferUnseen }),
      });
      const body = (await res.json().catch(() => null)) as {
        id?: string;
        error?: { message?: string; shortfalls?: { section: string; marks: number; needed: number; available: number }[] };
      } | null;
      if (res.ok && body?.id) return router.push(`/mocks/${body.id}`);
      const short = body?.error?.shortfalls;
      if (short?.length) {
        // Raw counts alone read as a crash; name what is actually short.
        const parts = short.map((s) => `${s.needed - s.available} more ${s.section} ${s.marks}-mark`);
        setError(
          `Not enough approved questions yet — the bank is short ${parts.join(', ')} to fill a full paper. ` +
            `Practice more or import questions, then try again.`
        );
      } else {
        setError(body?.error?.message ?? 'Could not build a paper.');
      }
    } catch {
      setError('Network problem. Try again.');
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-3 text-sm text-body-muted">
        <input
          type="checkbox"
          checked={preferUnseen}
          onChange={(e) => setPreferUnseen(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-ink"
        />
        <span>
          Prefer questions I have not seen
          <span className="block text-xs text-slate">
            Unseen questions give independent evidence of where you stand.
          </span>
        </span>
      </label>
      <button
        type="button"
        onClick={create}
        disabled={busy || disabled}
        className="h-10 rounded-full bg-ink text-sm text-white disabled:opacity-60"
      >
        {busy ? 'Building your paper…' : 'Build a new mock'}
      </button>
      {error && (
        <p role="alert" className="rounded-[20px] bg-butter p-3 text-sm text-ink">
          {error}
        </p>
      )}
    </div>
  );
}
