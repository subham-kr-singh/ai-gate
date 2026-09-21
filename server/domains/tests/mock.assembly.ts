import type { MockBlueprint, SectionSpec } from './mock.blueprint';
import {
  InsufficientQuestionBankError,
  type QuestionType,
  type SectionKey,
  type Shortfall,
} from './mock.types';

/**
 * Paper assembly — deterministic given (blueprint, candidates, seed), so every mock is
 * reproducible from its stored seed + assemblyVersion (architecture §75). No LLM, no DB.
 *
 * Strategy per section and per marks class (1-mark / 2-mark):
 *   1. Split the class quota across subjects in proportion to the blueprint's subject marks
 *      (largest-remainder), clamped to what the bank can supply.
 *   2. Inside each subject, prefer questions the student has NEVER seen (independent evidence
 *      for recommendation evaluation), then the least recently seen; spread across units.
 *   3. Nudge the type mix (MCQ/MSQ/NAT) toward the blueprint's soft targets.
 *   4. Order like the real paper: GA first, each section as its 1-mark block then its 2-mark
 *      block, subjects shuffled inside a block.
 */

export const ASSEMBLY_VERSION = 'v1';

export interface Candidate {
  id: string;
  /** slugifySubject(subject name) */
  subjectKey: string;
  unitId: string;
  marks: number;
  type: QuestionType;
  seenBefore: boolean;
  lastSeenAtMs: number | null;
}

export interface AssembledItem {
  position: number;
  questionId: string;
  section: SectionKey;
  marks: number;
  type: QuestionType;
  subjectKey: string;
  seenBefore: boolean;
}

export interface AssemblyResult {
  items: AssembledItem[];
  freshCount: number;
  version: string;
}

export interface AssemblyOptions {
  seed: string;
  /** Default true. */
  preferUnseen?: boolean;
  /** ± relative wobble applied to subject weights so papers differ like real ones. Default 0.15. */
  weightJitter?: number;
}

// ── seeded randomness ────────────────────────────────────────────────────────

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ── quota allocation ─────────────────────────────────────────────────────────

/**
 * Largest-remainder allocation of `total` seats across `weights`, never exceeding `capacity`.
 * Seats a subject cannot fill are redistributed to the others by weight.
 */
export function allocate(
  total: number,
  weights: Record<string, number>,
  capacity: Record<string, number>,
  rng: () => number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(weights)) out[k] = 0;
  let remaining = total;

  for (let guard = 0; guard < 100 && remaining > 0; guard++) {
    const active = Object.keys(weights).filter(
      (k) => (weights[k] ?? 0) > 0 && out[k]! < (capacity[k] ?? 0),
    );
    if (active.length === 0) break;

    const wsum = active.reduce((n, k) => n + weights[k]!, 0);
    const parts = active.map((k) => {
      const ideal = (remaining * weights[k]!) / wsum;
      return { k, base: Math.floor(ideal), frac: ideal - Math.floor(ideal) };
    });

    for (const p of parts) {
      const give = Math.min(p.base, capacity[p.k]! - out[p.k]!);
      out[p.k]! += give;
      remaining -= give;
    }
    if (remaining <= 0) break;

    // hand out leftovers one by one, biggest fractional part first (random tie-break)
    const order = shuffle(parts, rng).sort((a, b) => b.frac - a.frac);
    for (const p of order) {
      if (remaining <= 0) break;
      if (out[p.k]! < capacity[p.k]!) {
        out[p.k]! += 1;
        remaining -= 1;
      }
    }
  }
  return out;
}

// ── picking inside one subject bucket ────────────────────────────────────────

interface TypeTracker {
  targets: Partial<Record<QuestionType, number>>;
  counts: Record<QuestionType, number>;
  total: number;
}

function pickFromBucket(
  bucket: Candidate[],
  count: number,
  tracker: TypeTracker,
  preferUnseen: boolean,
  rng: () => number,
): Candidate[] {
  if (count <= 0) return [];

  // shuffle first (random within equal preference), then stable-sort by preference
  const ordered = shuffle(bucket, rng).sort((a, b) => {
    if (preferUnseen && a.seenBefore !== b.seenBefore) return a.seenBefore ? 1 : -1;
    return (a.lastSeenAtMs ?? -Infinity) - (b.lastSeenAtMs ?? -Infinity);
  });

  const queues = new Map<string, Candidate[]>();
  for (const c of ordered) {
    const q = queues.get(c.unitId) ?? [];
    q.push(c);
    queues.set(c.unitId, q);
  }
  const chosenPerUnit = new Map<string, number>();
  const picked: Candidate[] = [];

  while (picked.length < count) {
    const units = [...queues.entries()].filter(([, q]) => q.length > 0);
    if (units.length === 0) break;

    // least-represented unit first (round-robin across units); random tie-break
    const minChosen = Math.min(...units.map(([u]) => chosenPerUnit.get(u) ?? 0));
    const tied = units.filter(([u]) => (chosenPerUnit.get(u) ?? 0) === minChosen);
    const [unitId, queue] = tied[Math.floor(rng() * tied.length)]!;

    // look at the leading run of equally-preferred candidates (≤6) and favour the type we lack
    const head = queue[0]!;
    let window = 1;
    while (
      window < queue.length &&
      window < 6 &&
      (!preferUnseen || queue[window]!.seenBefore === head.seenBefore)
    ) {
      window++;
    }
    let bestIdx = 0;
    let bestDeficit = -Infinity;
    for (let i = 0; i < window; i++) {
      const t = queue[i]!.type;
      const target = tracker.targets[t] ?? 0;
      const deficit = target * (tracker.total + 1) - tracker.counts[t];
      if (deficit > bestDeficit + 1e-9) {
        bestDeficit = deficit;
        bestIdx = i;
      }
    }

    const [chosen] = queue.splice(bestIdx, 1);
    picked.push(chosen!);
    chosenPerUnit.set(unitId, (chosenPerUnit.get(unitId) ?? 0) + 1);
    tracker.counts[chosen!.type] += 1;
    tracker.total += 1;
  }
  return picked;
}

// ── public API ───────────────────────────────────────────────────────────────

export function assemblePaper(
  blueprint: MockBlueprint,
  candidates: readonly Candidate[],
  opts: AssemblyOptions,
): AssemblyResult {
  const rng = createRng(`${opts.seed}|${blueprint.key}|${ASSEMBLY_VERSION}`);
  const preferUnseen = opts.preferUnseen ?? true;
  const jitter = opts.weightJitter ?? 0.15;

  // 1) capacity pre-check: can the bank fill every section × marks class at all?
  const shortfalls: Shortfall[] = [];
  const pools = new Map<string, Candidate[]>(); // `${section}|${marks}` → candidates
  for (const section of blueprint.sections) {
    for (const [marks, need] of marksClasses(section)) {
      const pool = candidates.filter(
        (c) => c.marks === marks && section.subjectMarks[c.subjectKey] !== undefined,
      );
      pools.set(`${section.key}|${marks}`, pool);
      if (pool.length < need) {
        shortfalls.push({ section: section.key, marks, needed: need, available: pool.length });
      }
    }
  }
  if (shortfalls.length > 0) throw new InsufficientQuestionBankError(shortfalls);

  // 2) pick
  const items: AssembledItem[] = [];
  for (const section of blueprint.sections) {
    const tracker: TypeTracker = {
      targets: section.typeMix,
      counts: { MCQ: 0, MSQ: 0, NAT: 0 },
      total: 0,
    };

    for (const [marks, need] of marksClasses(section)) {
      const pool = pools.get(`${section.key}|${marks}`)!;
      const bySubject = new Map<string, Candidate[]>();
      for (const c of pool) {
        const b = bySubject.get(c.subjectKey) ?? [];
        b.push(c);
        bySubject.set(c.subjectKey, b);
      }

      const weights: Record<string, number> = {};
      const capacity: Record<string, number> = {};
      for (const [subject, m] of Object.entries(section.subjectMarks)) {
        weights[subject] = m * (1 + (rng() * 2 - 1) * jitter);
        capacity[subject] = bySubject.get(subject)?.length ?? 0;
      }
      const quota = allocate(need, weights, capacity, rng);

      const block: Candidate[] = [];
      for (const subject of Object.keys(quota)) {
        block.push(
          ...pickFromBucket(bySubject.get(subject) ?? [], quota[subject]!, tracker, preferUnseen, rng),
        );
      }
      for (const c of shuffle(block, rng)) {
        items.push({
          position: 0,
          questionId: c.id,
          section: section.key,
          marks: c.marks,
          type: c.type,
          subjectKey: c.subjectKey,
          seenBefore: c.seenBefore,
        });
      }
    }
  }

  items.forEach((it, i) => (it.position = i + 1));
  return {
    items,
    freshCount: items.filter((i) => !i.seenBefore).length,
    version: ASSEMBLY_VERSION,
  };
}

function marksClasses(section: SectionSpec): [number, number][] {
  return [
    [1, section.oneMark],
    [2, section.twoMark],
  ];
}
