/**
 * Every read Part 3 needs from the Part 1/2 tables lives here, so if your
 * schema names differ there is exactly one file to adapt.
 *
 * Assumed models/relations (see README):
 *   Subject 1-* Unit 1-* Topic 1-* Concept          (relations: unit.subject, topic.unit, concept.topic)
 *   Question *-* Concept via QuestionConcept{questionId, conceptId}
 *   ConceptDependency{conceptId, prerequisiteId}
 * Names and ordering are read defensively (name/title/label, order/position/...).
 */
import { db as prisma } from "@/server/db/client";
import type { Db } from "../shared/db";

type Row = Record<string, unknown>;

export const labelOf = (row: object): string => {
  const r = row as Row;
  for (const k of ["name", "title", "label"]) if (typeof r[k] === "string") return r[k] as string;
  return String(r.id);
};

export const orderOf = (row: object): number => {
  const r = row as Row;
  for (const k of ["order", "position", "sortOrder", "ordinal", "index"]) if (typeof r[k] === "number") return r[k] as number;
  return 0;
};

export interface ConceptPlacement {
  conceptId: string;
  topicId: string;
  unitId: string;
}

export async function getConceptPlacements(conceptIds: string[], db: Db = prisma): Promise<Map<string, ConceptPlacement>> {
  if (!conceptIds.length) return new Map();
  const rows = await db.concept.findMany({
    where: { id: { in: conceptIds } },
    select: { id: true, topicId: true, topic: { select: { unitId: true } } },
  });
  return new Map(rows.map((r) => [r.id, { conceptId: r.id, topicId: r.topicId, unitId: r.topic.unitId }]));
}

export async function getUnitConceptIds(unitId: string, db: Db = prisma): Promise<string[]> {
  const rows = await db.concept.findMany({ where: { topic: { unitId } }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function getTopicIdsInUnit(unitId: string, db: Db = prisma): Promise<string[]> {
  const rows = await db.topic.findMany({ where: { unitId }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function getTopicConceptIds(topicIds: string[], db: Db = prisma): Promise<string[]> {
  if (!topicIds.length) return [];
  const rows = await db.concept.findMany({ where: { topicId: { in: topicIds } }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function getQuestionConceptIds(questionIds: string[], db: Db = prisma): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!questionIds.length) return map;
  const rows = await db.questionConcept.findMany({
    where: { questionId: { in: questionIds } },
    select: { questionId: true, conceptId: true },
  });
  for (const r of rows) map.set(r.questionId, [...(map.get(r.questionId) ?? []), r.conceptId]);
  return map;
}

export async function getPrerequisitePairs(
  conceptIds: string[],
  db: Db = prisma,
): Promise<{ conceptId: string; prerequisiteId: string }[]> {
  if (!conceptIds.length) return [];
  return db.conceptDependency.findMany({
    where: { conceptId: { in: conceptIds } },
    select: { conceptId: true, prerequisiteId: true },
  });
}

export const countUnits = (db: Db = prisma): Promise<number> => db.unit.count();

export interface UnitLabel {
  unitId: string;
  unit: string;
  subjectId: string;
  subject: string;
}

export async function getUnitLabels(unitIds: string[], db: Db = prisma): Promise<Map<string, UnitLabel>> {
  if (!unitIds.length) return new Map();
  const rows = await db.unit.findMany({ where: { id: { in: unitIds } }, include: { subject: true } });
  return new Map(
    rows.map((u) => [u.id, { unitId: u.id, unit: labelOf(u), subjectId: u.subjectId, subject: labelOf(u.subject) }]),
  );
}

export interface ConceptLabel {
  conceptId: string;
  concept: string;
  topic: string;
  unitId: string;
}

export async function getConceptLabels(conceptIds: string[], db: Db = prisma): Promise<Map<string, ConceptLabel>> {
  if (!conceptIds.length) return new Map();
  const rows = await db.concept.findMany({ where: { id: { in: conceptIds } }, include: { topic: true } });
  return new Map(
    rows.map((c) => [c.id, { conceptId: c.id, concept: labelOf(c), topic: labelOf(c.topic), unitId: c.topic.unitId }]),
  );
}

/** All units in syllabus order, for filter dropdowns. */
export async function listUnitsWithSubjects(db: Db = prisma): Promise<UnitLabel[]> {
  const rows = await db.unit.findMany({ include: { subject: true } });
  return rows
    .sort((a, b) => orderOf(a.subject) - orderOf(b.subject) || orderOf(a) - orderOf(b))
    .map((u) => ({ unitId: u.id, unit: labelOf(u), subjectId: u.subjectId, subject: labelOf(u.subject) }));
}

export async function getUnitIdsForSubject(subjectId: string, db: Db = prisma): Promise<string[]> {
  const rows = await db.unit.findMany({ where: { subjectId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Concepts of one unit in syllabus order. */
export async function getUnitConcepts(unitId: string, db: Db = prisma): Promise<{ id: string; name: string }[]> {
  const rows = await db.concept.findMany({ where: { topic: { unitId } } });
  return rows.sort((a, b) => orderOf(a) - orderOf(b)).map((c) => ({ id: c.id, name: labelOf(c) }));
}

export interface UnitWithTopics extends UnitLabel {
  topics: { id: string; name: string }[];
}

/** Units with their topics, in syllabus order (assumes relation `unit.topics`). */
export async function listUnitsWithTopics(db: Db = prisma): Promise<UnitWithTopics[]> {
  const rows = await db.unit.findMany({ include: { subject: true, topics: true } });
  return rows
    .sort((a, b) => orderOf(a.subject) - orderOf(b.subject) || orderOf(a) - orderOf(b))
    .map((u) => ({
      unitId: u.id,
      unit: labelOf(u),
      subjectId: u.subjectId,
      subject: labelOf(u.subject),
      topics: [...u.topics].sort((a, b) => orderOf(a) - orderOf(b)).map((t) => ({ id: t.id, name: labelOf(t) })),
    }));
}
