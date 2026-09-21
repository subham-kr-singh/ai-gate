import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/server/auth/require";
import { getTree } from "@/server/domains/syllabus/syllabus.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Practice" };

/**
 * Practice hub. The nav rail linked straight to /practice, which had no page —
 * every tap on "Practice" was a 404. This is the overview that replaces it:
 * the daily set plus every unit you can start a topic quiz from.
 */
export default async function PracticePage() {
  const user = await requireUser();
  const tree = await getTree();
  const units = tree.subjects.flatMap((s) =>
    s.units.map((u) => ({ unitId: u.id, unit: u.name, subject: s.name, subjectId: s.id }))
  );

  return (
    <AppShell active="practice" initial={(user.name ?? user.email)[0]?.toUpperCase()}>
      <header>
        <h1 className="text-xl font-semibold text-[#111111]">Practice</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-[#77736D]">
          Your daily set is built from weak concepts, prerequisites, revision due and past mistakes.
          Or start a topic quiz on any single unit.
        </p>
      </header>

      <section aria-labelledby="dpp" className="rounded-[24px] bg-[#0E8074] p-7 text-white md:p-8">
        <h2 id="dpp" className="font-semibold leading-[1.05]" style={{ fontSize: "clamp(20px,2.2vw,28px)" }}>
          Today&apos;s practice set
        </h2>
        <p className="mt-2 max-w-md text-sm text-white/80">
          Twenty questions chosen for you. No picking, no decision fatigue.
        </p>
        <Link
          href="/practice/dpp"
          className="mt-5 inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-medium text-[#111111]"
        >
          Open the daily set
        </Link>
      </section>

      <section aria-labelledby="units">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="units" className="font-semibold text-[#111111]">
            Topic quiz by unit
          </h2>
          <span className="text-sm text-[#77736D]">{units.length} units</span>
        </div>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
          {units.map((u) => (
            <li key={u.unitId}>
              <Link
                href={`/practice/${u.unitId}`}
                className="flex h-full flex-col justify-between rounded-[20px] border border-[#E3E0DA] bg-white p-5 transition-colors hover:border-[#111111]"
              >
                <div>
                  <p className="text-xs text-[#77736D]">{u.subject}</p>
                  <p className="mt-0.5 font-semibold text-[#111111]">{u.unit}</p>
                </div>
                <span className="mt-3 text-sm text-[#111111] underline underline-offset-2">
                  Start topic quiz
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
