/**
 * server/domains/gateoverflow/gateoverflow.mapper.ts
 *
 * Turns a parsed question's `(chapter, subtopic)` into a canonical
 * `(subjectId, unitId, topicId, conceptId?)`.
 *
 * The syllabus index is built once per run and passed in, so the mapping
 * itself is a pure function over data — cheap to test and free of per-row
 * database round-trips.
 */

import { db } from "@/server/db/client";
import {
  CHAPTER_MAP,
  CONCEPT_ALIASES,
  NON_GATE_CHAPTERS,
  SKIPPED_CHAPTER_PREFIX,
  TAG_TO_SUBJECT,
} from "./gateoverflow.config";
import type { Placement } from "./gateoverflow.types";

interface ConceptNode {
  id: string;
  name: string;
}

interface UnitNode {
  id: string;
  name: string;
  topicId: string;
  topicName: string;
  concepts: ConceptNode[];
}

interface SubjectNode {
  id: string;
  code: string;
  units: UnitNode[];
}

export interface SyllabusIndex {
  subjects: SubjectNode[];
}

/** Normalise case, spacing and punctuation for syllabus label comparisons. */
function normaliseKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 /]/g, "");
}

/** Loads the active syllabus version's tree, with one Topic per Unit (the
 * shape prisma/seed writes). Falls back to the first version if none is
 * flagged active, matching how the rest of the app reads the syllabus. */
export async function buildSyllabusIndex(): Promise<SyllabusIndex> {
  const version =
    (await db.syllabusVersion.findFirst({ where: { isActive: true } })) ??
    (await db.syllabusVersion.findFirst());

  if (!version) {
    throw new Error("No syllabus version found. Run `npm run seed` first.");
  }

  const subjects = await db.subject.findMany({
    where: { syllabusVersionId: version.id },
    orderBy: { order: "asc" },
    include: {
      units: {
        orderBy: { order: "asc" },
        include: {
          topics: {
            orderBy: { order: "asc" },
            include: { concepts: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });

  return {
    subjects: subjects.map((subject) => ({
      id: subject.id,
      code: subject.code,
      units: subject.units.map((unit) => {
        const topic = unit.topics[0];
        if (!topic) {
          throw new Error(`Unit "${unit.name}" has no topic; re-run the syllabus seed.`);
        }
        return {
          id: unit.id,
          name: unit.name,
          topicId: topic.id,
          topicName: topic.name,
          concepts: topic.concepts.map((concept) => ({ id: concept.id, name: concept.name })),
        };
      }),
    })),
  };
}

export type PlacementResult =
  | { status: "placed"; placement: Placement; matchedConcept: boolean }
  | { status: "unmapped-chapter" }
  | { status: "skipped-chapter" }
  | { status: "unmapped-unit" };

/** Match a subtopic by alias or normalised name, then try a prefix match; return null if absent. */
function findConcept(unit: UnitNode, subtopic: string | null): ConceptNode | null {
  if (!subtopic) return null;
  const key = normaliseKey(subtopic);
  const alias = CONCEPT_ALIASES[key];
  const target = normaliseKey(alias ?? subtopic);
  return (
    unit.concepts.find((concept) => normaliseKey(concept.name) === target) ??
    // The book's labels are sometimes a prefix of the syllabus wording
    // ("Cache" vs "Cache and related memory concepts").
    unit.concepts.find((concept) => {
      const name = normaliseKey(concept.name);
      return target.length >= 4 && (name.startsWith(target) || target.startsWith(name));
    }) ??
    null
  );
}

/** The subtopic can land on a unit other than the chapter's default one —
 * "Virtual Memory" under the book's single Operating System chapter belongs
 * to the seeded Memory Management unit, not Process Management. So the whole
 * subject is searched, and a hit moves the placement to that concept's unit.
 * The chapter's mapped unit remains the fallback for untagged subtopics. */
function findUnitForSubtopic(subject: SubjectNode, subtopic: string | null): {
  unit: UnitNode;
  concept: ConceptNode;
} | null {
  if (!subtopic) return null;
  for (const unit of subject.units) {
    const concept = findConcept(unit, subtopic);
    if (concept) return { unit, concept };
  }
  return null;
}

/** Chapters whose questions carry no usable subject heading; their subject
 * has to come from the question's own tags. */
const CATCH_ALL_CHAPTERS = new Set(["Unknown Category", "Others: Others"]);

/** Resolve a chapter’s subject, using question tags only for catch-all chapters. */
function resolveSubjectCode(chapter: string, tags: string[]): string | null {
  const mapping = CHAPTER_MAP[chapter];
  if (mapping) return mapping.subjectCode;
  if (!CATCH_ALL_CHAPTERS.has(chapter)) return null;
  for (const tag of tags) {
    const code = TAG_TO_SUBJECT[tag.trim().toLowerCase()];
    if (code) return code;
  }
  return null;
}

/** Map a question to syllabus ids, preferring a matched concept’s unit over the chapter default.
 * Return a skip or unmapped status when the chapter or syllabus cannot be used. */
export function placeQuestion(
  index: SyllabusIndex,
  chapter: string,
  subtopic: string | null,
  tags: string[] = []
): PlacementResult {
  if (chapter.startsWith(SKIPPED_CHAPTER_PREFIX)) return { status: "skipped-chapter" };
  if (NON_GATE_CHAPTERS.includes(chapter)) return { status: "skipped-chapter" };

  const subjectCode = resolveSubjectCode(chapter, tags);
  if (!subjectCode) return { status: "unmapped-chapter" };

  const subject = index.subjects.find((s) => s.code === subjectCode);
  if (!subject) return { status: "unmapped-unit" };

  // A tag-derived subject has no chapter to give a default unit, so the first
  // unit of that subject is used; the subtopic still overrides it when known.
  const defaultUnit =
    subject.units.find((u) => normaliseKey(u.name) === normaliseKey(CHAPTER_MAP[chapter]?.unitName ?? "")) ??
    subject.units[0];
  if (!defaultUnit) return { status: "unmapped-unit" };

  const match = findUnitForSubtopic(subject, subtopic);
  const unit = match?.unit ?? defaultUnit;

  return {
    status: "placed",
    matchedConcept: match !== null,
    placement: {
      subjectId: subject.id,
      unitId: unit.id,
      topicId: unit.topicId,
      conceptId: match?.concept.id ?? null,
    },
  };
}
