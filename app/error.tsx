"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary. Before this existed a database hiccup showed a
 * bare "Unhandled Runtime Error" screen with no way back. The message stays
 * generic; the digest is shown so a specific failure can be correlated with
 * the server log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5">
      <div className="w-full max-w-md rounded-[24px] border border-line bg-white p-7">
        <h1 className="text-xl font-semibold text-ink">That didn&apos;t load</h1>
        <p className="mt-2 text-sm text-slate">
          Something failed while building this page. Nothing you had already saved was lost. Try
          again, and if it keeps happening the server log will have the reference below.
        </p>
        {error.digest && (
          // DESIGN.md §3 rules out monospace, so the digest uses tabular
          // figures instead — it still reads as an opaque identifier.
          <p className="mt-3 text-xs tabular-nums text-slate-light">Reference {error.digest}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-white"
          >
            Try again
          </button>
          <Link
            href="/planner"
            className="inline-flex h-10 items-center rounded-full border border-line px-5 text-sm text-ink"
          >
            Go to Today
          </Link>
        </div>
      </div>
    </main>
  );
}
