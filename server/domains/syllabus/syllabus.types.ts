export interface ConceptNode {
  id: string;
  name: string;
  order: number;
}

export interface TopicNode {
  id: string;
  name: string;
  order: number;
  concepts: ConceptNode[];
}

export interface UnitNode {
  id: string;
  name: string;
  order: number;
  targetDurationDays: number | null;
  maximumExtensionDays: number | null;
  topics: TopicNode[];
}

export interface SubjectNode {
  id: string;
  code: string;
  name: string;
  order: number;
  units: UnitNode[];
}

export interface SyllabusTree {
  syllabusVersionId: string;
  label: string;
  subjects: SubjectNode[];
}

/** Result of resolving a natural-language or loosely-formatted reference
 * (e.g. "OS Unit 2", "subnetting") to canonical syllabus entities. */
export interface ResolvedEntity {
  subjectId: string;
  unitId?: string;
  topicId?: string;
  conceptId?: string;
  matchedOn: "subject" | "unit" | "topic" | "concept";
  confidence: number; // 0–1, string-similarity based in v1 (no AI yet)
}
