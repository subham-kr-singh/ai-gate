import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubjectDetail } from "@/server/domains/syllabus/syllabus.service";
import { ConceptTree } from "@/components/syllabus/ConceptTree";

export default async function SubjectDetailPage({
  params,
}: {
  params: { subjectId: string };
}) {
  const subject = await getSubjectDetail(params.subjectId);
  if (!subject) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/syllabus" className="text-sm text-slate hover:text-teal">
        Back to syllabus
      </Link>

      <header className="mt-4">
        <span className="text-xs text-slate">{subject.code}</span>
        <h1 className="font-display text-2xl font-semibold text-fog">
          {subject.name}
        </h1>
      </header>

      <section className="mt-6 border border-slate/30 p-6">
        <ConceptTree units={subject.units} />
      </section>
    </main>
  );
}
