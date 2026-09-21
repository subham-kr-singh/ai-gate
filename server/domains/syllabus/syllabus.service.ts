import * as repo from "./syllabus.repository";
import type { ResolvedEntity, SyllabusTree } from "./syllabus.types";

/** Returns the full syllabus tree for the currently active
 * SyllabusVersion. Throws if no version is marked active — that's a
 * seeding bug, not a normal empty-state. */
export async function getTree(): Promise<SyllabusTree> {
  const version = await repo.findActiveSyllabusVersion();
  if (!version) {
    throw new Error(
      "No active SyllabusVersion found — run `npm run seed` first."
    );
  }
  const subjects = await repo.findSyllabusTreeRows(version.id);
  return {
    syllabusVersionId: version.id,
    label: version.label,
    subjects: subjects.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      order: s.order,
      units: s.units.map((u) => ({
        id: u.id,
        name: u.name,
        order: u.order,
        targetDurationDays: u.targetDurationDays,
        maximumExtensionDays: u.maximumExtensionDays,
        topics: u.topics.map((t) => ({
          id: t.id,
          name: t.name,
          order: t.order,
          concepts: t.concepts.map((c) => ({
            id: c.id,
            name: c.name,
            order: c.order,
          })),
        })),
      })),
    })),
  };
}

export async function getSubjectDetail(subjectId: string) {
  return repo.findSubjectById(subjectId);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Very small Jaccard-on-tokens similarity — enough to resolve loosely
 * phrased references like "OS Unit 2" or "subnetting" to canonical IDs
 * without pulling in an AI call for Part 1/2. Phase C's chatbot can
 * later replace/augment this with LLM extraction feeding the same
 * canonical IDs. */
function similarity(a: string, b: string): number {
  const ta = new Set(normalize(a).split(" ").filter(Boolean));
  const tb = new Set(normalize(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const tok of ta) if (tb.has(tok)) overlap++;
  return overlap / new Set([...ta, ...tb]).size;
}

/** Resolves a free-text reference to the closest matching syllabus
 * entity (subject/unit/topic/concept), preferring the most specific
 * (deepest) match above a confidence floor. */
export async function resolveEntity(
  syllabusVersionId: string,
  query: string
): Promise<ResolvedEntity | null> {
  const subjects = await repo.findAllEntityNames(syllabusVersionId);

  let best: ResolvedEntity | null = null;
  const consider = (candidate: Omit<ResolvedEntity, "confidence">, label: string) => {
    const score = similarity(query, label);
    if (score > 0 && (best === null || score > best.confidence)) {
      best = { ...candidate, confidence: score };
    }
  };

  for (const s of subjects) {
    consider({ subjectId: s.id, matchedOn: "subject" }, `${s.code} ${s.name}`);
    for (const u of s.units) {
      consider(
        { subjectId: s.id, unitId: u.id, matchedOn: "unit" },
        `${s.name} ${u.name}`
      );
      for (const t of u.topics) {
        consider(
          { subjectId: s.id, unitId: u.id, topicId: t.id, matchedOn: "topic" },
          t.name
        );
        for (const c of t.concepts) {
          consider(
            {
              subjectId: s.id,
              unitId: u.id,
              topicId: t.id,
              conceptId: c.id,
              matchedOn: "concept",
            },
            c.name
          );
        }
      }
    }
  }

  const MIN_CONFIDENCE = 0.2;
  const finalBest = best as ResolvedEntity | null;
  return finalBest && finalBest.confidence >= MIN_CONFIDENCE ? finalBest : null;
}
