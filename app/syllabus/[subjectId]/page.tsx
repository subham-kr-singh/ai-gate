import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/server/auth/require";
import { getSubjectDetail } from "@/server/domains/syllabus/syllabus.service";

export const dynamic = "force-dynamic";

export default async function SubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const user = await requireUser();
  const { subjectId } = await params;
  const subject = await getSubjectDetail(subjectId);
  if (!subject) notFound();

  return (
    <AppShell active="syllabus" initial={(user.name ?? user.email)[0]?.toUpperCase()} width="reading">
      <header>
        <Link
          href="/syllabus"
          className="text-sm text-slate underline-offset-2 hover:underline"
        >
          ← Syllabus
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-ink">{subject.name}</h1>
        <p className="text-sm text-slate">{subject.units.length} units</p>
      </header>

      <div className="flex flex-col gap-4">
        {subject.units.map((unit) => (
          <section key={unit.id} className="rounded-[20px] border border-line bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">{unit.name}</h2>
              <Link
                href={`/practice/${unit.id}`}
                className="text-xs text-ink underline underline-offset-2 hover:no-underline"
              >
                Start topic quiz →
              </Link>
            </div>
            <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
              {unit.topics.flatMap((t) => t.concepts).map((c) => (
                <li key={c.id} className="text-xs text-slate">
                  {c.name}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
