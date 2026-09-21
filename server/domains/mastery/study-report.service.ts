/**
 * Quick Study Report: work done outside the app. Self-report is evidence at
 * reduced weight - it never marks a unit complete by itself. Coverage the
 * student reports is stored separately (StudentCoverage) from the validated
 * LearningState.
 */
import { db as prisma } from "@/server/db/client";
import { track } from "../analytics/analytics.service";
import { seedReviewsAfterStudy } from "../revision/revision.service";
import * as lookup from "../syllabus/syllabus.lookup";
import { DEFAULT_COMPLETION_CONFIG } from "./completion.config";
import { DEFAULT_MASTERY_CONFIG, type MasteryConfig } from "./mastery.config";
import { applyBatchEvidence, applyWeakFlag, markCovered, type StatsSnapshot } from "./mastery.math";
import { recomputeUnitState } from "./mastery.service";
import * as repo from "./mastery.repository";
import type { StudyReportInput } from "./study-report.schema";

export class StudyReportError extends Error {
  constructor(public code: "UNKNOWN_UNIT" | "TOPIC_NOT_IN_UNIT", message: string) {
    super(message);
  }
}

export interface StudyReportResult {
  reportId: string;
  unitId: string;
  duplicate: boolean;
  status?: string;
  decision?: string;
}

export async function submitStudyReport(
  userId: string,
  input: StudyReportInput,
  cfg: MasteryConfig = DEFAULT_MASTERY_CONFIG,
  now: Date = new Date(),
): Promise<StudyReportResult> {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.studySessionReport.findUnique({
        where: { userId_clientRequestId: { userId, clientRequestId: input.clientRequestId } },
      });
      if (existing) return { reportId: existing.id, unitId: existing.unitId, duplicate: true };

      const unitTopicIds = await lookup.getTopicIdsInUnit(input.unitId, tx);
      if (!unitTopicIds.length) throw new StudyReportError("UNKNOWN_UNIT", "That unit does not exist.");
      const inUnit = new Set(unitTopicIds);
      const outside = [...input.topicsCoveredIds, ...input.weakTopicIds].filter((t) => !inUnit.has(t));
      if (outside.length) throw new StudyReportError("TOPIC_NOT_IN_UNIT", "Some topics do not belong to this unit.");

      const session = await tx.studySession.create({ data: { userId, unitId: input.unitId, source: "MANUAL" } });
      const report = await tx.studySessionReport.create({
        data: {
          sessionId: session.id,
          userId,
          clientRequestId: input.clientRequestId,
          unitId: input.unitId,
          status: input.status,
          topicsCoveredIds: input.topicsCoveredIds,
          weakTopicIds: input.weakTopicIds,
          questionsAttempted: input.questionsAttempted,
          questionsCorrect: input.questionsCorrect,
          pyqAttempted: input.pyqAttempted,
          pyqCorrect: input.pyqCorrect,
          selfConfidence: input.selfConfidence ?? null,
          continueUnit: input.continueUnit,
          notes: input.notes ?? null,
        },
      });

      // Weak topics count as studied. Concepts under them are also flagged weak.
      const studiedTopicIds = [...new Set([...input.topicsCoveredIds, ...input.weakTopicIds])];
      const coveredConcepts = await lookup.getTopicConceptIds(studiedTopicIds, tx);
      const weakConcepts = new Set(await lookup.getTopicConceptIds(input.weakTopicIds, tx));
      const prev = await repo.loadConceptStats(tx, userId, coveredConcepts);

      for (const cid of coveredConcepts) {
        let s: StatsSnapshot | null = markCovered(prev.get(cid) ?? null, 1, now);
        s = applyBatchEvidence(s, { attempted: input.questionsAttempted, correct: input.questionsCorrect, weight: cfg.selfReportWeight }, now, cfg);
        s = applyBatchEvidence(s, { attempted: input.pyqAttempted, correct: input.pyqCorrect, weight: cfg.selfReportWeight }, now, cfg);
        if (weakConcepts.has(cid)) s = applyWeakFlag(s, now, cfg);
        await repo.saveConceptStats(tx, userId, cid, s);
      }
      await seedReviewsAfterStudy(tx, userId, coveredConcepts, now);

      await tx.studentCoverage.upsert({
        where: { userId_unitId: { userId, unitId: input.unitId } },
        create: {
          userId,
          unitId: input.unitId,
          reportedStatus: input.status,
          reportedPercent: Math.min(1, studiedTopicIds.length / unitTopicIds.length),
        },
        update: {
          reportedStatus: input.status,
          reportedPercent: Math.min(1, studiedTopicIds.length / unitTopicIds.length),
        },
      });

      await repo.bumpReportedCounters(tx, userId, input.unitId, {
        attempted: input.questionsAttempted,
        correct: input.questionsCorrect,
        pyqAttempted: input.pyqAttempted,
        pyqCorrect: input.pyqCorrect,
        wantsToContinue: input.continueUnit,
      });

      const result = await recomputeUnitState(userId, input.unitId, tx, cfg, DEFAULT_COMPLETION_CONFIG, now);
      await track(tx, userId, "TOPIC_STUDIED", { unitId: input.unitId, reportId: report.id, topics: studiedTopicIds.length });

      return {
        reportId: report.id,
        unitId: input.unitId,
        duplicate: false,
        status: result?.status,
        decision: result?.decision,
      };
    },
    { timeout: 30_000 },
  );
}
