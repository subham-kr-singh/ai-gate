import type { UnitNode } from "@/server/domains/syllabus/syllabus.types";
import { Divider } from "@/components/ui/Divider";

interface ConceptTreeProps {
  units: UnitNode[];
}

/**
 * Static read-only tree for Part 1. Coverage/mastery bars per unit are
 * wired in once ConceptStats exists (Part 3) — see components/dashboard/.
 */
export function ConceptTree({ units }: ConceptTreeProps) {
  return (
    <div className="flex flex-col">
      {units.map((unit, i) => (
        <div key={unit.id}>
          {i > 0 && <Divider className="my-4" />}
          <div className="flex items-baseline gap-3">
            <span className="text-xs text-slate">{unit.code}</span>
            <h3 className="font-display text-base font-semibold text-fog">
              {unit.name}
            </h3>
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {unit.topics
              .flatMap((topic) => topic.concepts)
              .map((concept) => (
                <li
                  key={concept.id}
                  className="border border-slate/30 px-2 py-1 text-xs text-fog/80"
                >
                  {concept.name}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
