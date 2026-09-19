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
  code: string;
  name: string;
  order: number;
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
