/**
 * Dashboard read models that need more than a single count: the daily activity
 * series behind the chart, and per-subject rollups.
 *
 * Everything here is read-only and derived. Day bucketing goes through
 * `dayKey(now, timezone)` for the same reason session detection does — a
 * student's "today" is their calendar day, not the server's UTC day.
 */
import { db as prisma } from "@/server/db/client";
import { dayKey, addDays, type DayKey } from "@/server/domains/planner/dates";
import * as lookup from "@/server/domains/syllabus/syllabus.lookup";

const DAY = 86_400_000;

export interface ActivityPoint {
  day: DayKey;
  attempted: number;
  correct: number;
}

export interface ActivitySeries {
  points: ActivityPoint[];
  from: DayKey;
  to: DayKey;
  totalAttempted: number;
  totalCorrect: number;
  /** Longest run of consecutive days ending at `to` with any activity. */
  streak: number;
  /** Mean attempted across days that had activity; 0 when none did. */
  activeDayAverage: number;
}

/**
 * Attempted/correct per day over the trailing `days` window, in the student's
 * timezone. Both evidence sources count: submitted test answers and completed
 * DPP questions — the same two `session-detect` reads, so this chart and the
 * session list can never disagree about how much work happened on a day.
 */
export async function getActivitySeries(
  userId: string,
  opts: { days?: number; timezone?: string; now?: Date; subjectId?: string | null } = {},
): Promise<ActivitySeries> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 120);
  const tz = opts.timezone ?? "UTC";
  const now = opts.now ?? new Date();
  const subjectId = opts.subjectId || null;

  const to = dayKey(now, tz);
  const from = addDays(to, -(days - 1));
  // Widen the SQL bound: a local day can start up to ~14h away from its UTC
  // key, and the precise bucketing happens below.
  const since = new Date(now.getTime() - (days + 2) * DAY);
  const until = new Date(now.getTime() + DAY);

  // Scoping by subject happens in SQL, not after bucketing, so the series
  // matches the subject-scoped tiles it sits beside.
  const questionScope = subjectId
    ? { question: { unit: { subjectId } } }
    : {};

  const [answers, dppRows] = await Promise.all([
    prisma.answer.findMany({
      where: { userId, attempt: { submittedAt: { gte: since, lte: until } }, ...questionScope },
      select: { correct: true, attempt: { select: { submittedAt: true } } },
    }),
    prisma.dPPQuestion.findMany({
      where: { completedAt: { gte: since, lte: until }, dpp: { userId }, ...questionScope },
      select: { completedAt: true, correct: true },
    }),
  ]);

  const buckets = new Map<DayKey, { attempted: number; correct: number }>();
  for (let i = 0; i < days; i++) buckets.set(addDays(from, i), { attempted: 0, correct: 0 });

  const record = (at: Date | null, correct: boolean | null) => {
    if (!at) return;
    const b = buckets.get(dayKey(at, tz));
    // Rows outside the window are expected from the widened SQL bound; drop
    // them rather than growing the series past the requested length.
    if (!b) return;
    b.attempted += 1;
    if (correct) b.correct += 1;
  };

  for (const a of answers) record(a.attempt.submittedAt, a.correct);
  for (const d of dppRows) record(d.completedAt, d.correct);

  const points: ActivityPoint[] = [...buckets.entries()].map(([day, b]) => ({ day, ...b }));
  const totalAttempted = points.reduce((s, p) => s + p.attempted, 0);
  const totalCorrect = points.reduce((s, p) => s + p.correct, 0);
  const activeDays = points.filter((p) => p.attempted > 0).length;

  let streak = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if ((points[i]?.attempted ?? 0) === 0) break;
    streak += 1;
  }

  return {
    points,
    from,
    to,
    totalAttempted,
    totalCorrect,
    streak,
    activeDayAverage: activeDays === 0 ? 0 : Math.round(totalAttempted / activeDays),
  };
}

export interface SubjectRollup {
  subjectId: string;
  subject: string;
  unitsStarted: number;
  totalUnits: number;
  /** Mean coverage/mastery across the subject's units, 0..1. */
  coverage: number;
  mastery: number;
  questionsLast7d: number;
  openMistakes: number;
}

/**
 * Per-subject rollup. Units with no LearningState row count toward
 * `totalUnits` but contribute 0 coverage — the same denominator `getOverview`
 * uses, so filtered numbers sum back to the unfiltered ones.
 */
export async function getSubjectRollups(userId: string, now = new Date()): Promise<SubjectRollup[]> {
  const since7 = new Date(now.getTime() - 7 * DAY);

  const [units, states, answers, mistakes] = await Promise.all([
    prisma.unit.findMany({ select: { id: true, subjectId: true } }),
    prisma.learningState.findMany({
      where: { userId },
      select: { unitId: true, coverage: true, mastery: true, status: true },
    }),
    prisma.answer.findMany({
      where: { userId, attempt: { submittedAt: { gte: since7 } } },
      select: { question: { select: { unitId: true } } },
    }),
    prisma.mistake.findMany({ where: { userId, resolved: false }, select: { unitId: true } }),
  ]);

  const labels = await lookup.getUnitLabels(units.map((u) => u.id));
  const stateByUnit = new Map(states.map((s) => [s.unitId, s]));
  const subjectOfUnit = new Map(units.map((u) => [u.id, u.subjectId]));

  const acc = new Map<string, SubjectRollup>();
  for (const u of units) {
    const row = acc.get(u.subjectId);
    if (row) {
      row.totalUnits += 1;
    } else {
      acc.set(u.subjectId, {
        subjectId: u.subjectId,
        subject: labels.get(u.id)?.subject ?? u.subjectId,
        unitsStarted: 0,
        totalUnits: 1,
        coverage: 0,
        mastery: 0,
        questionsLast7d: 0,
        openMistakes: 0,
      });
    }
  }

  for (const [unitId, s] of stateByUnit) {
    const row = acc.get(subjectOfUnit.get(unitId) ?? "");
    if (!row) continue;
    if (s.status !== "NOT_STARTED") row.unitsStarted += 1;
    row.coverage += s.coverage;
    row.mastery += s.mastery;
  }

  for (const a of answers) {
    const unitId = a.question?.unitId;
    const row = unitId ? acc.get(subjectOfUnit.get(unitId) ?? "") : undefined;
    if (row) row.questionsLast7d += 1;
  }

  for (const m of mistakes) {
    const row = m.unitId ? acc.get(subjectOfUnit.get(m.unitId) ?? "") : undefined;
    if (row) row.openMistakes += 1;
  }

  return [...acc.values()]
    .map((r) => ({
      ...r,
      coverage: r.totalUnits === 0 ? 0 : r.coverage / r.totalUnits,
      mastery: r.totalUnits === 0 ? 0 : r.mastery / r.totalUnits,
    }))
    .sort((a, b) => b.questionsLast7d - a.questionsLast7d || a.subject.localeCompare(b.subject));
}
