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
    <div className="flex min-h-screen items-center justify-center bg-[#F8F6F2] px-5">
      <div className="w-full max-w-md rounded-[24px] border border-[#E3E0DA] bg-white p-7">
        <h1 className="text-xl font-semibold text-[#111111]">That didn&apos;t load</h1>
        <p className="mt-2 text-sm text-[#77736D]">
          Something failed while building this page. Nothing you had already saved was lost. Try
          again, and if it keeps happening the server log will have the reference below.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-[#9B968E]">Reference {error.digest}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center rounded-full bg-[#111111] px-5 text-sm font-medium text-white"
          >
            Try again
          </button>
          <Link
            href="/planner"
            className="inline-flex h-10 items-center rounded-full border border-[#E3E0DA] px-5 text-sm text-[#111111]"
          >
            Go to Today
          </Link>
        </div>
      </div>
    </div>
  );
}
