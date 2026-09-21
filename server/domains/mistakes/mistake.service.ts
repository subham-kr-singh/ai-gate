import { db as prisma } from "@/server/db/client";
import { getConceptLabels, getUnitIdsForSubject, getUnitLabels } from "../syllabus/syllabus.lookup";
import * as repo from "./mistake.repository";
import { MISTAKE_TYPES, type MistakeFilters, type MistakeTypeValue } from "./mistake.types";

export class MistakeError extends Error {
  constructor(public code: "NOT_FOUND", message: string) {
    super(message);
  }
}

/** One-tap tagging. Reference the mistake by its id or by Part 2's answerId. */
export async function tagMistake(
  userId: string,
  input: { mistakeId?: string; answerId?: string; mistakeType: MistakeTypeValue; note?: string },
): Promise<void> {
  const m = await repo.findOwned(prisma, userId, input);
  if (!m) throw new MistakeError("NOT_FOUND", "No such mistake for this account.");
  await repo.setType(prisma, m.id, input.mistakeType, input.note);
}

export async function setMistakeResolved(userId: string, mistakeId: string, resolved: boolean): Promise<void> {
  const m = await repo.findOwned(prisma, userId, { mistakeId });
  if (!m) throw new MistakeError("NOT_FOUND", "No such mistake for this account.");
  await repo.setResolved(prisma, m.id, resolved, new Date());
}

export interface MistakeListItem {
  id: string;
  createdAt: Date;
  mistakeType: MistakeTypeValue | null;
  resolved: boolean;
  note: string | null;
  questionId: string | null;
  unitLabel: string | null;
  subjectLabel: string | null;
  concepts: string[];
}

export async function listMistakes(userId: string, filters: MistakeFilters): Promise<MistakeListItem[]> {
  const unitIds = !filters.unitId && filters.subjectId ? await getUnitIdsForSubject(filters.subjectId) : undefined;
  const rows = await repo.listRows(repo.buildWhere(userId, filters, unitIds), Math.min(filters.limit ?? 50, 200));

  const unitLabels = await getUnitLabels([...new Set(rows.flatMap((r) => (r.unitId ? [r.unitId] : [])))]);
  const conceptLabels = await getConceptLabels([...new Set(rows.flatMap((r) => r.concepts.map((c) => c.conceptId)))]);

  return rows.map((r) => {
    const u = r.unitId ? unitLabels.get(r.unitId) : undefined;
    return {
      id: r.id,
      createdAt: r.createdAt,
      mistakeType: r.mistakeType,
      resolved: r.resolved,
      note: r.note,
      questionId: r.questionId,
      unitLabel: u?.unit ?? null,
      subjectLabel: u?.subject ?? null,
      concepts: r.concepts.map((c) => conceptLabels.get(c.conceptId)?.concept).filter((x): x is string => !!x),
    };
  });
}

export interface MistakeSummary {
  open: number;
  untagged: number;
  byType: Record<MistakeTypeValue, number>;
}

export async function getMistakeSummary(userId: string): Promise<MistakeSummary> {
  const groups = await repo.groupOpenByType(userId);
  const byType = Object.fromEntries(MISTAKE_TYPES.map((t) => [t, 0])) as Record<MistakeTypeValue, number>;
  let untagged = 0;
  let open = 0;
  for (const g of groups) {
    open += g._count._all;
    if (g.mistakeType === null) untagged += g._count._all;
    else byType[g.mistakeType] = g._count._all;
  }
  return { open, untagged, byType };
}
