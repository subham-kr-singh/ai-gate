import Link from "next/link";
import type { SubjectNode } from "@/server/domains/syllabus/syllabus.types";

interface SubjectCardProps {
  subject: SubjectNode;
}

export function SubjectCard({ subject }: SubjectCardProps) {
  const unitCount = subject.units.length;
  const conceptCount = subject.units.reduce(
    (sum, unit) => sum + unit.topics.reduce((s, t) => s + t.concepts.length, 0),
    0
  );

  return (
    <Link
      href={`/syllabus/${subject.id}`}
      className="block border border-slate/30 p-5 transition-colors hover:border-teal"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate">{subject.code}</span>
        <span className="text-xs text-slate">
          {unitCount} units, {conceptCount} concepts
        </span>
      </div>
      <h2 className="mt-1 font-display text-lg font-semibold text-fog">{subject.name}</h2>
    </Link>
  );
}
