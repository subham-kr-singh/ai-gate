/**
 * server/domains/tutor/tutor.context.ts
 *
 * Assembles everything the tutor is allowed to know about the student into one
 * compact snapshot: overview, weak units and concepts, due revision, open
 * mistakes, flashcards, plan/pace, and recent answers.
 *
 * This is a read model. The tutor answers FROM this and proposes changes via
 * tutor.actions.ts — it never writes on its own (architecture §Chatbot-to-
 * Learning-State Pipeline).
 */

import { db } from "@/server/db/client";
import { STATUS_LABELS, type UnitStatusValue } from "@/lib/status";
import { countDue } from "@/server/domains/flashcards/flashcard.service";
import { getOverview, getPendingRevision, getWeakConcepts, getWeakUnitReport } from "@/server/domains/mastery/mastery.queries";
import * as repo from "@/server/domains/planner/planner.repository";
import { buildContext, getProgressReports } from "@/server/domains/planner/planner.service";

export interface TutorUnit {
  unitId: string;
  unit: string;
  subject: string;
  status: string;
  statusLabel: string;
  readiness: number | null;
  coverage: number;
  mastery: number;
  pyqAccuracy: number | null;
  openMistakes: number;
}

export interface TutorConcept {
  conceptId: string;
  name: string;
  mastery: number;
  recentAccuracy: number | null;
  mistakes: number;
}

export interface TutorMistake {
  id: string;
  question: string;
  mistakeType: string | null;
}

export interface TutorContext {
  generatedAt: string;
  overview: {
    totalUnits: number;
    unitsStarted: number;
    coveragePct: number;
    masteryPct: number | null;
    reviewsDue: number;
    openMistakes: number;
    untaggedMistakes: number;
    weakConceptCount: number;
    questionsLast7d: number;
    questionsLast24h: number;
  };
  pace: {
    status: string;
    daysToExam: number | null;
    unitsLeft: number;
    averageDaysPerUnit: number | null;
    needed: number | null;
  };
  phase: number;
  activeUnits: TutorUnit[];
  weakUnits: TutorUnit[];
  weakConcepts: TutorConcept[];
  dueRevision: { conceptId: string; name: string; retention: number | null }[];
  openMistakes: TutorMistake[];
  flashcardsDue: number;
  todayAnswers: number;
  recentAnswers: { question: string; correct: boolean; unit: string | null }[];
}

const pct = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100));

/**
 * Builds the snapshot. Every read is bounded so the tutor's prompt stays a
 * predictable size regardless of how much history has accumulated.
 */
export async function buildTutorContext(userId: string, now = new Date()): Promise<TutorContext> {
  const [overview, weakUnits, weakConcepts, revision, reports, planCtx, flashcardsDue, plan] = await Promise.all([
    getOverview(userId, now),
    getWeakUnitReport(userId, 6),
    getWeakConcepts(userId, 6, now),
    getPendingRevision(userId, 6, now),
    getProgressReports(userId, now),
    buildContext(userId, now),
    countDue(userId, now),
    repo.getOrCreatePlan(userId, now),
  ]);

  const recent = await db.answer.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { question: { select: { statement: true, unitId: true } } },
  });

  const unitIds = [...new Set(recent.map((a) => a.question.unitId))];
  const unitRows = unitIds.length
    ? await db.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } })
    : [];
  const unitNames = new Map(unitRows.map((r) => [r.id, r.name]));

  const openMistakes = await db.mistake.findMany({
    where: { userId, resolved: false },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, questionId: true, mistakeType: true, unitId: true },
  });

  // Mistake rows only carry a questionId, so fetch the statements separately.
  const mistakeQuestionIds = [...new Set(openMistakes.map((m) => m.questionId).filter(Boolean))] as string[];
  const mistakeQuestions = mistakeQuestionIds.length
    ? await db.question.findMany({ where: { id: { in: mistakeQuestionIds } }, select: { id: true, statement: true } })
    : [];
  const questionStatement = new Map(mistakeQuestions.map((q) => [q.id, q.statement]));

  const todayStart = new Date(`${planCtx.todayKey}T00:00:00.000Z`);
  const todayAnswers = await db.answer.count({ where: { userId, createdAt: { gte: todayStart } } });

  const toUnit = (u: (typeof weakUnits)[number]): TutorUnit => ({
    unitId: u.unitId,
    unit: u.unit,
    subject: u.subject,
    status: u.status,
    statusLabel: STATUS_LABELS[u.status as UnitStatusValue] ?? u.status,
    readiness: u.readiness,
    coverage: u.coverage,
    mastery: u.mastery,
    pyqAccuracy: u.pyqAccuracy,
    openMistakes: u.openMistakes,
  });

  const active = planCtx.out.units
    .filter((u) => u.plan.status === "ACTIVE" || u.plan.status === "PENDING")
    .slice(0, 6);

  return {
    generatedAt: now.toISOString(),
    overview: {
      totalUnits: overview.totalUnits,
      unitsStarted: overview.unitsStarted,
      coveragePct: pct(overview.coverage) ?? 0,
      masteryPct: pct(overview.mastery),
      reviewsDue: overview.reviewsDue,
      openMistakes: overview.openMistakes,
      untaggedMistakes: overview.untaggedMistakes,
      weakConceptCount: overview.weakConceptCount,
      questionsLast7d: overview.questionsLast7d,
      questionsLast24h: overview.questionsLast24h,
    },
    pace: {
      status: reports.pace.status,
      daysToExam: reports.pace.daysToExam,
      unitsLeft: Number(reports.pace.remainingUnitEquivalents.toFixed(1)),
      averageDaysPerUnit: reports.velocity.averageDays,
      needed: reports.pace.requiredUnitsPerDay,
    },
    phase: planCtx.phase.phase,
    activeUnits: active.map((u) => ({
      unitId: u.unitId,
      unit: u.unitName,
      subject: u.subjectName,
      status: u.plan.status,
      statusLabel: STATUS_LABELS[u.plan.status as UnitStatusValue] ?? u.plan.status,
      readiness: planCtx.out.exits[u.unitId]?.readiness ?? null,
      coverage: u.coverage,
      mastery: u.mastery ?? 0,
      pyqAccuracy: u.pyqAccuracy,
      openMistakes: u.openMistakes,
    })),
    weakUnits: weakUnits.map(toUnit),
    weakConcepts: weakConcepts.map((c) => ({
      conceptId: c.conceptId,
      name: c.name,
      mastery: c.mastery,
      recentAccuracy: c.recentAccuracy,
      mistakes: c.mistakes,
    })),
    dueRevision: revision.map((r) => ({ conceptId: r.conceptId, name: r.name, retention: r.retention })),
    openMistakes: openMistakes.map((m) => ({
      id: m.id,
      question: (m.questionId ? questionStatement.get(m.questionId) : null)?.slice(0, 160) ?? "(question removed)",
      mistakeType: m.mistakeType ?? null,
    })),
    flashcardsDue,
    todayAnswers,
    recentAnswers: recent.map((a) => ({
      question: a.question.statement.slice(0, 140),
      correct: a.correct,
      unit: unitNames.get(a.question.unitId) ?? null,
    })),
  };
}

/** Compact, model-readable rendering. Numbers only — the tutor is told never to
 * quote a statistic that isn't in here. */
export function renderTutorContext(ctx: TutorContext): string {
  const o = ctx.overview;
  const lines: string[] = ["STUDENT STATE (the only data you may quote):"];

  lines.push(`- Coverage ${o.coveragePct}% (${o.unitsStarted}/${o.totalUnits} units started); concept mastery ${o.masteryPct == null ? "no data" : `${o.masteryPct}%`}.`);
  lines.push(`- ${o.questionsLast7d} questions in 7 days, ${o.questionsLast24h} in the last 24h.`);
  lines.push(`- Weak concepts ${o.weakConceptCount}; open mistakes ${o.openMistakes} (${o.untaggedMistakes} untagged); revision due ${o.reviewsDue}; flashcards due ${ctx.flashcardsDue}; phase ${ctx.phase}.`);
  lines.push(
    ctx.pace.daysToExam == null
      ? "- No exam date set, so pace cannot be judged."
      : `- Pace ${ctx.pace.status}: ${ctx.pace.daysToExam} days left, ${ctx.pace.unitsLeft} units remaining, ${ctx.pace.averageDaysPerUnit == null ? "speed unknown" : `${ctx.pace.averageDaysPerUnit.toFixed(1)} days/unit`}.`,
  );

  if (ctx.activeUnits.length) {
    lines.push("ACTIVE UNITS:");
    for (const u of ctx.activeUnits) {
      lines.push(`- [${u.unitId}] ${u.subject} / ${u.unit}: ${u.statusLabel}, coverage ${Math.round(u.coverage * 100)}%, mastery ${Math.round(u.mastery * 100)}%, ${u.openMistakes} open mistake(s).`);
    }
  }
  if (ctx.weakUnits.length) {
    lines.push("WEAK UNITS:");
    for (const u of ctx.weakUnits) {
      lines.push(`- [${u.unitId}] ${u.unit}: readiness ${u.readiness == null ? "unknown" : `${Math.round(u.readiness * 100)}%`}, mastery ${Math.round(u.mastery * 100)}%.`);
    }
  }
  if (ctx.weakConcepts.length) {
    lines.push("WEAK CONCEPTS:");
    for (const c of ctx.weakConcepts) {
      lines.push(`- ${c.name}: mastery ${Math.round(c.mastery * 100)}%${c.recentAccuracy == null ? "" : `, recent accuracy ${Math.round(c.recentAccuracy * 100)}%`}, ${c.mistakes} mistake(s).`);
    }
  }
  if (ctx.dueRevision.length) {
    lines.push("REVISION DUE:");
    for (const r of ctx.dueRevision) lines.push(`- ${r.name}: retention ${r.retention == null ? "new" : `${Math.round(r.retention * 100)}%`}.`);
  }
  if (ctx.openMistakes.length) {
    lines.push("OPEN MISTAKES:");
    for (const m of ctx.openMistakes) lines.push(`- ${m.question} (${m.mistakeType ?? "untagged"})`);
  }
  return lines.join("\n");
}
