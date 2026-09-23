import Link from "next/link";

/** Root 404. Lives outside AppShell on purpose: a bad URL may be hit before we
 * know who the visitor is, and AppShell resolves the signed-in initial. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-5 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-slate">404</p>
      <h1 className="text-xl font-semibold text-ink">That page does not exist</h1>
      <p className="max-w-sm text-sm text-slate">
        The link may be out of date, or the item it pointed at has been removed.
      </p>
      <Link
        href="/planner"
        className="mt-2 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-white"
      >
        Back to Today
      </Link>
    </main>
  );
}