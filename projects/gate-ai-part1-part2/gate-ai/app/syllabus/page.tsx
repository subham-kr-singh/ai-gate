import Link from "next/link";
import { requireUser } from "@/server/auth/require";
import { getTree } from "@/server/domains/syllabus/syllabus.service";

export default async function SyllabusPage() {
  await requireUser();
  const tree = await getTree();

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10 flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-slate hover:text-ink">
          ← Dashboard
        </Link>
        <h1 className="text-xl font-semibold text-ink mt-2">{tree.label}</h1>
        <p className="text-sm text-slate">
          {tree.subjects.length} subjects, {tree.subjects.reduce((n, s) => n + s.units.length, 0)}{" "}
          units.
        </p>
      </div>

      <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-white">
        {tree.subjects.map((s) => (
          <Link
            key={s.id}
            href={`/syllabus/${s.id}`}
            className="flex items-center justify-between px-5 py-4 hover:bg-control/50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-ink">{s.name}</p>
              <p className="text-xs text-slate">{s.code}</p>
            </div>
            <span className="text-xs text-slate">{s.units.length} units</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
