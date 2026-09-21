import Link from "next/link";
import { requireUser } from "@/server/auth/require";
import { getRecentAttempts } from "@/server/domains/tests/test.service";

export default async function TestsPage() {
  const user = await requireUser();
  const attempts = await getRecentAttempts(user.id);

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10 flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-slate hover:text-ink">
          ← Dashboard
        </Link>
        <h1 className="text-xl font-semibold text-ink mt-2">Test history</h1>
        <p className="text-sm text-slate">Append-only — past attempts are never rewritten.</p>
      </div>

      {attempts.length === 0 ? (
        <p className="text-sm text-slate">
          No attempts yet. Start a topic quiz from the{" "}
          <Link href="/syllabus" className="underline">
            syllabus
          </Link>{" "}
          page.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-white">
          {attempts.map((a) => (
            <Link
              key={a.id}
              href={("/tests/" + a.testId + "/result") as any}
              className="flex items-center justify-between px-5 py-4 hover:bg-control/50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-ink">{a.test.title}</p>
                <p className="text-xs text-slate">
                  {new Date(a.submittedAt).toLocaleString()} &middot; {a.test.type}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-ink">
                  {a.scoredMarks.toFixed(2)} / {a.totalMarks.toFixed(2)}
                </p>
                <p className="text-xs text-slate">{(a.accuracy * 100).toFixed(0)}% accuracy</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
