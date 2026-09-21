import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/require";
import { getSubjectDetail } from "@/server/domains/syllabus/syllabus.service";

export default async function SubjectPage({ params }: { params: { subjectId: string } }) {
  await requireUser();
  const subject = await getSubjectDetail(params.subjectId);
  if (!subject) notFound();

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10 flex flex-col gap-6">
      <div>
        <Link href="/syllabus" className="text-sm text-slate hover:text-ink">
          ← Syllabus
        </Link>
        <h1 className="text-xl font-semibold text-ink mt-2">{subject.name}</h1>
        <p className="text-sm text-slate">{subject.units.length} units</p>
      </div>

      <div className="flex flex-col gap-4">
        {subject.units.map((unit) => (
          <div key={unit.id} className="rounded-card border border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{unit.name}</p>
              <Link
                href={`/practice/${unit.id}`}
                className="text-xs text-ink underline hover:no-underline"
              >
                Start topic quiz →
              </Link>
            </div>
            <ul className="mt-3 flex flex-col gap-1">
              {unit.topics.flatMap((t) => t.concepts).map((c) => (
                <li key={c.id} className="text-xs text-slate">
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
