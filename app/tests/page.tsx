import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/server/auth/require";
import { getRecentAttempts } from "@/server/domains/tests/test.service";

export const dynamic = "force-dynamic";

export default async function TestsPage() {
  const user = await requireUser();
  const attempts = await getRecentAttempts(user.id);

  return (
    <AppShell active="tests" initial={(user.name ?? user.email)[0]?.toUpperCase()} width="reading">
      <header>
        <h1 className="text-xl font-semibold text-ink">Test history</h1>
        <p className="text-sm text-slate">Append-only — past attempts are never rewritten.</p>
      </header>

      {attempts.length === 0 ? (
        <p className="text-sm text-slate">
          No attempts yet. Start a topic quiz from the{" "}
          <Link href="/practice" className="underline underline-offset-2">
            practice
          </Link>{" "}
          page.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line rounded-[20px] border border-line bg-white">
          {attempts.map((a) => (
            <Link
              key={a.id}
              href={`/tests/${a.testId}/result`}
              className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-control/50"
            >
              <div>
                <p className="text-sm font-medium text-ink">{a.test.title}</p>
                <p className="text-xs text-slate">
                  {new Date(a.submittedAt).toLocaleString()} &middot; {a.test.type}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-ink">
                  {a.scoredMarks.toFixed(2)} / {a.totalMarks.toFixed(2)}
                </p>
                <p className="text-xs text-slate">{(a.accuracy * 100).toFixed(0)}% accuracy</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
