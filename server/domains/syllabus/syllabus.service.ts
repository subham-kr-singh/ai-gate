import {
  findActiveSyllabusVersion,
  findSyllabusTreeRaw,
  findSubjectById,
} from "./syllabus.repository";
import type { SyllabusTree, SubjectNode } from "./syllabus.types";

export async function getSyllabusTree(): Promise<SyllabusTree | null> {
  const version = await findActiveSyllabusVersion();
  if (!version) return null;

  const subjects = await findSyllabusTreeRaw(version.id);

  return {
    syllabusVersionId: version.id,
    label: version.label,
    subjects: subjects.map(toSubjectNode),
  };
}

export async function getSubjectDetail(
  subjectId: string,
): Promise<SubjectNode | null> {
  const subject = await findSubjectById(subjectId);
  if (!subject) return null;
  return toSubjectNode(subject);
}

// Loosely typed input — matches the shape Prisma's `include` returns above.
// Kept as `any`-free but structural, so this file has no direct Prisma
// model type import (keeps the domain layer provider-independent per
// architecture doc §117).
function toSubjectNode(subject: {
  id: string;
  code: string;
  name: string;
  order: number;
  units: Array<{
    id: string;
    code: string;
    name: string;
    order: number;
    topics: Array<{
      id: string;
      name: string;
      order: number;
      concepts: Array<{ id: string; name: string; order: number }>;
    }>;
  }>;
}): SubjectNode {
  return {
    id: subject.id,
    code: subject.code,
    name: subject.name,
    order: subject.order,
    units: subject.units.map((unit) => ({
      id: unit.id,
      code: unit.code,
      name: unit.name,
      order: unit.order,
      topics: unit.topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        order: topic.order,
        concepts: topic.concepts.map((c) => ({
          id: c.id,
          name: c.name,
          order: c.order,
        })),
      })),
    })),
  };
}
