/**
 * A tiny in-memory stand-in for the slice of PrismaClient that
 * dpp.service.ts calls. It understands enough of Prisma's `where` shape
 * (equality, `in`, `not`, `lt`/`lte`/`gt`/`gte`, and one level of nested
 * relation filtering) to exercise the real candidate-source queries
 * without a database.
 *
 * This is test scaffolding only — the real app talks to Postgres via the
 * actual PrismaClient (see server/db/client.ts).
 */

type Where = Record<string, any>;

function matchesCondition(value: any, condition: any): boolean {
  if (condition === null) return value === null;
  if (typeof condition !== "object" || condition instanceof Date) {
    return value === condition;
  }
  if ("in" in condition) return condition.in.includes(value);
  if ("notIn" in condition) return !condition.notIn.includes(value);
  if ("not" in condition) {
    if (condition.not === null) return value !== null;
    return !matchesCondition(value, condition.not);
  }
  let ok = true;
  if ("lt" in condition) ok = ok && value !== null && value < condition.lt;
  if ("lte" in condition) ok = ok && value !== null && value <= condition.lte;
  if ("gt" in condition) ok = ok && value !== null && value > condition.gt;
  if ("gte" in condition) ok = ok && value !== null && value >= condition.gte;
  return ok;
}

function matchesWhere(record: any, where?: Where): boolean {
  if (!where) return true;
  for (const [key, condition] of Object.entries(where)) {
    if (key === "OR") {
      const branches = condition as Where[];
      if (!branches.some((branch) => matchesWhere(record, branch))) return false;
      continue;
    }
    if (key === "AND") {
      const branches = condition as Where[];
      if (!branches.every((branch) => matchesWhere(record, branch))) return false;
      continue;
    }
    const value = record[key];
    if (condition !== null && typeof condition === "object" && !(condition instanceof Date) && !("in" in condition) && !("notIn" in condition) && !("not" in condition) && !("lt" in condition) && !("lte" in condition) && !("gt" in condition) && !("gte" in condition)) {
      // Nested relation filter, e.g. { question: { status: "APPROVED" } }
      if (!matchesWhere(value, condition)) return false;
      continue;
    }
    if (!matchesCondition(value, condition)) return false;
  }
  return true;
}

function applyOrder<T>(rows: T[], orderBy?: Record<string, "asc" | "desc">): T[] {
  if (!orderBy) return rows;
  const [key, direction] = Object.entries(orderBy)[0] as [string, "asc" | "desc"];
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a: any, b: any) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return av > bv ? sign : -sign;
  });
}

function makeModel<T extends Record<string, any>>(seed: T[]) {
  const rows = [...seed];
  return {
    async findMany(args: { where?: Where; orderBy?: Record<string, "asc" | "desc">; take?: number; select?: any; distinct?: string[] } = {}) {
      let result = rows.filter((r) => matchesWhere(r, args.where));
      result = applyOrder(result, args.orderBy);
      if (args.distinct) {
        const seen = new Set<string>();
        result = result.filter((r) => {
          const key = args.distinct!.map((f) => r[f]).join("|");
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      if (args.take) result = result.slice(0, args.take);
      return result;
    },
    _rows: rows,
  };
}

export interface FakeQuestion {
  id: string;
  status: "APPROVED" | "DRAFT";
  year: number | null;
}
export interface FakeQuestionConcept {
  questionId: string;
  conceptId: string;
  question: { status: "APPROVED" | "DRAFT" };
}
export interface FakeConceptStats {
  userId: string;
  conceptId: string;
  mastery: number;
  nextReviewAt: Date | null;
}
export interface FakeConceptDependency {
  conceptId: string;
  prerequisiteConceptId: string;
}
export interface FakeMistake {
  userId: string;
  concepts: { conceptId: string }[];
  createdAt: Date;
}
export interface FakeAnswer {
  userId: string;
  questionId: string;
}

export interface FakeSeed {
  questions: FakeQuestion[];
  questionConcepts: FakeQuestionConcept[];
  conceptStats: FakeConceptStats[];
  conceptDependencies: FakeConceptDependency[];
  mistakes: FakeMistake[];
  answers: FakeAnswer[];
}

/** Builds a fake PrismaClient-shaped object, plus an in-memory DPP table with the create/findUnique used by dpp.service.ts. */
export function createFakeDb(seed: FakeSeed) {
  const dppTable: any[] = [];
  let dppIdCounter = 1;
  let dppQuestionIdCounter = 1;

  return {
    question: makeModel(seed.questions),
    questionConcept: makeModel(seed.questionConcepts),
    conceptStats: makeModel(seed.conceptStats),
    conceptDependency: makeModel(seed.conceptDependencies),
    mistake: makeModel(seed.mistakes),
    answer: makeModel(seed.answers),
    dPP: {
      async findUnique({ where, include }: any) {
        const { userId, date } = where.userId_date;
        const found = dppTable.find(
          (d) => d.userId === userId && d.date.getTime() === date.getTime()
        );
        if (!found) return null;
        if (include?.questions) {
          return { ...found, questions: [...found.questions].sort((a, b) => a.position - b.position) };
        }
        return found;
      },
      async create({ data, include }: any) {
        const record = {
          id: `dpp-${dppIdCounter++}`,
          userId: data.userId,
          date: data.date,
          algorithmVersion: data.algorithmVersion,
          targetCount: data.targetCount,
          questions: data.questions.create.map((q: any) => ({
            id: `dppq-${dppQuestionIdCounter++}`,
            questionId: q.questionId,
            conceptId: q.conceptId,
            source: q.source,
            position: q.position,
          })),
        };
        dppTable.push(record);
        if (include?.questions) {
          return { ...record, questions: [...record.questions].sort((a, b) => a.position - b.position) };
        }
        return record;
      },
    },
  };
}
