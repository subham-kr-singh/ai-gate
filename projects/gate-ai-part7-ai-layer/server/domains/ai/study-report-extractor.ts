import { AIService } from "./ai.service";
import { StudyReportDraftSchema, type StudyReportDraft } from "./types";
import { BudgetExceededError } from "./budget-guard";

/**
 * server/domains/ai/study-report-extractor.ts
 *
 * Chatbot-to-Learning-State Pipeline (architecture doc §37/§Chatbot-to-
 * Learning-State Pipeline):
 *
 *   Student message -> LLM extraction -> Study Report Draft
 *   -> user confirmation -> Learning-State Engine -> Planner
 *
 * CRITICAL: this function returns a DRAFT only. It must never be passed
 * directly to server/domains/mastery or server/domains/mistakes. The
 * caller (app/api/chat/route.ts) shows the draft to the user, lets them
 * edit/confirm it in the SAME form Part 3 built for manual entry, and
 * only THEN posts it to /api/study-reports.
 *
 * The chatbot must use the same structured study-report workflow as the
 * normal UI — this module exists to fill that form, not to bypass it.
 */

export interface ExtractionContext {
  /** Canonical subject/unit names known to the syllabus, for grounding. */
  knownSubjects: string[];
}

const SYSTEM_PROMPT = `You extract a structured GATE study-session report
from a student's free-text message. You do not know the student's actual
performance beyond what they say — never invent numbers they didn't state.
If a field wasn't mentioned, use null (or an empty array for lists) and add
the field name to "ambiguousFields". Map the subject/unit to the closest
name in the known-subjects list if there's a clear match; otherwise keep
the student's raw wording and flag it as ambiguous.`;

export async function extractStudyReportDraft(
  studentMessage: string,
  context: ExtractionContext
): Promise<StudyReportDraft | { unavailable: true; reason: string }> {
  const prompt = `Known subjects: ${context.knownSubjects.join(", ")}

Student message:
"""
${studentMessage}
"""

Extract into this exact JSON shape:
{
  "subjectRaw": string,
  "unitRaw": string,
  "status": "not_started" | "learning" | "practicing" | "provisionally_complete" | "mastered",
  "topicsCovered": string[],
  "weakTopics": string[],
  "questionsAttempted": number | null,
  "questionsCorrect": number | null,
  "pyqsAttempted": number | null,
  "pyqsCorrect": number | null,
  "selfConfidence": "low" | "medium" | "high" | null,
  "continueUnit": boolean,
  "notes": string | null,
  "extractionConfidence": number,
  "ambiguousFields": string[]
}

"continueUnit" should be true unless the student clearly says they're
moving on / done with the unit. "status" should reflect what they
described doing (e.g. mentioning weak areas and more practice needed =
"practicing", not "mastered") — do not upgrade status based on confident-
sounding language alone.`;

  try {
    const draft = await AIService.generateStructured({
      system: SYSTEM_PROMPT,
      prompt,
      schema: StudyReportDraftSchema,
      purpose: "study_report_extraction",
      maxTokens: 500,
    });
    return draft;
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return {
        unavailable: true,
        reason:
          "Daily AI budget reached. Use the manual Quick Study Report form instead — it uses the exact same fields.",
      };
    }
    return {
      unavailable: true,
      reason:
        "Couldn't parse that into a study report. Try the manual form, or rephrase with subject/unit/questions attempted-correct.",
    };
  }
}

/**
 * Self-report vs performance guard (architecture doc §39).
 * Call this AFTER the user confirms the draft and it reaches the
 * mastery/completion services — not here. Left as a pure helper so
 * server/domains/mastery/completion.service.ts can import it without a
 * dependency on the AI layer.
 */
export function flagsSelfReportOverconfidence(params: {
  selfConfidence: StudyReportDraft["selfConfidence"];
  recentAccuracy: number | null; // 0-1
  pyqAccuracy: number | null; // 0-1
  repeatedMistakeCount: number;
}): boolean {
  if (params.selfConfidence !== "high") return false;
  const weakAccuracy =
    (params.recentAccuracy !== null && params.recentAccuracy < 0.5) ||
    (params.pyqAccuracy !== null && params.pyqAccuracy < 0.5);
  return weakAccuracy || params.repeatedMistakeCount >= 4;
}
