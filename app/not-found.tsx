import Link from "next/link";

/** Root 404. Lives outside AppShell on purpose: a bad URL may be hit before we
 * know who the visitor is, and AppShell resolves the signed-in initial. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F8F6F2] px-5 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-[#77736D]">404</p>
      <h1 className="text-xl font-semibold text-[#111111]">That page does not exist</h1>
      <p className="max-w-sm text-sm text-[#77736D]">
        The link may be out of date, or the item it pointed at has been removed.
      </p>
      <Link
        href="/planner"
        className="mt-2 inline-flex h-10 items-center rounded-full bg-[#111111] px-5 text-sm font-medium text-white"
      >
        Back to Today
      </Link>
    </div>
  );
}