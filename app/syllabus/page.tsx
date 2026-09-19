import { getSyllabusTree } from "@/server/domains/syllabus/syllabus.service";
import { SubjectCard } from "@/components/syllabus/SubjectCard";

export default async function SyllabusPage() {
  const tree = await getSyllabusTree();

  if (!tree) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-2xl font-semibold text-fog">
          Syllabus
        </h1>
        <p className="mt-3 text-sm text-fog/80">
          No syllabus is loaded yet. Run{" "}
          <code className="text-teal">npm run seed</code> to import it.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header>
        <h1 className="font-display text-2xl font-semibold text-fog">
          Syllabus
        </h1>
        <p className="mt-1 text-sm text-slate">{tree.label}</p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tree.subjects.map((subject) => (
          <SubjectCard key={subject.id} subject={subject} />
        ))}
      </div>
    </main>
  );
}
