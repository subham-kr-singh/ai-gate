import { requireUser } from "@/server/auth/require";
import { getTree } from "@/server/domains/syllabus/syllabus.service";
import { ProgressBar } from "@/components/ui/ProgressBar";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireUser();
  const tree = await getTree();

  const totalUnits = tree.subjects.reduce((sum, s) => sum + s.units.length, 0);

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10 flex flex-col gap-7">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate">Welcome back,</p>
          <h1 className="text-xl font-semibold text-ink">{user.email.split("@")[0]}</h1>
        </div>
        <Link href="/syllabus" className="text-sm text-slate hover:text-ink">
          Browse syllabus →
        </Link>
      </div>

      <div className="rounded-hero p-7 md:p-8 bg-teal text-white">
        <h2 className="font-semibold leading-tight" style={{ fontSize: "clamp(24px,2.6vw,34px)" }}>
          {tree.label}
        </h2>
        <p className="mt-2 text-sm text-white/80 max-w-md">
          {tree.subjects.length} subjects &middot; {totalUnits} units loaded. Take a topic quiz to
          start building attempt history — mastery and DPP generation wire in once Part 3 lands.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-ink">Subjects</h3>
          <span className="text-sm text-slate">{tree.subjects.length} total</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {tree.subjects.map((s) => (
            <Link
              key={s.id}
              href={`/syllabus/${s.id}`}
              className="rounded-card p-5 bg-white border border-line hover:border-ink transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-control flex items-center justify-center font-semibold text-ink text-sm">
                {s.code.slice(0, 2)}
              </div>
              <p className="font-semibold text-ink mt-3">{s.name}</p>
              <p className="text-xs text-slate">{s.units.length} units</p>
              <ProgressBar percent={0} className="mt-3" />
              <p className="text-xs text-slate mt-1">Not started</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-card border border-line p-5">
        <p className="font-semibold text-ink mb-1">Start a topic quiz</p>
        <p className="text-sm text-slate mb-4">
          Pick a unit from the syllabus page to launch a quiz against the trusted question bank.
        </p>
        <Link href={"/tests" as any} className="text-sm text-ink underline">
          View test history →
        </Link>
      </div>
    </div>
  );
}
