import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/server/auth/require";
import { getTree } from "@/server/domains/syllabus/syllabus.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Syllabus" };

export default async function SyllabusPage() {
  const user = await requireUser();
  const tree = await getTree();
  const unitCount = tree.subjects.reduce((n, s) => n + s.units.length, 0);

  return (
    <AppShell active="syllabus" initial={(user.name ?? user.email)[0]?.toUpperCase()} width="reading">
      <header>
        <h1 className="text-xl font-semibold text-ink">{tree.label}</h1>
        <p className="text-sm text-slate">
          {tree.subjects.length} subjects, {unitCount} units.
        </p>
      </header>

      <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-[20px] border border-line bg-white p-0">
        {tree.subjects.map((s) => (
          <li key={s.id}>
            <Link
              href={`/syllabus/${s.id}`}
              className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-control/50"
            >
              <div>
                <p className="text-sm font-medium text-ink">{s.name}</p>
                <p className="text-xs text-slate">{s.code}</p>
              </div>
              <span className="text-xs text-slate">{s.units.length} units</span>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
