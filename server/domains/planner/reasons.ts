/**
 * Machine-readable reasons -> human text. The text is deterministic; an LLM may
 * rephrase it later (Part 7) but never produces the numbers.
 */
import type { PlannerAction, PriorityKey, PriorityResult, Reason, ReasonType, UnitSignals } from "./planner.types";

export const ACTION_LABEL: Record<PlannerAction, string> = {
  STUDY_CONCEPT: "Study",
  REVISE_CONCEPT: "Revise",
  SOLVE_EASY: "Solve easy questions",
  SOLVE_MEDIUM: "Solve medium questions",
  SOLVE_HARD: "Solve hard questions",
  REVIEW_MISTAKES: "Review mistakes",
  TAKE_MINI_TEST: "Take a check quiz",
  TAKE_TOPIC_TEST: "Take a mastery check",
  TAKE_MOCK: "Take a full mock",
  FLASHCARD_REVIEW: "Review flashcards",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function describeReason(r: Reason): string {
  switch (r.type) {
    case "LOW_MASTERY":
      return `Mastery is ${pct(r.value)}.`;
    case "LOW_RECENT_ACCURACY":
      return `Recent accuracy is ${pct(r.value)}.`;
    case "PYQ_WEAKNESS":
      return `PYQ accuracy is ${pct(r.value)}.`;
    case "REPEATED_MISTAKES":
      return `${plural(Math.round(r.value), "mistake")} logged in this unit.`;
    case "PREREQUISITE_GAP":
      return `${pct(r.value)} of dependent concepts have weak prerequisites.`;
    case "REVISION_DUE":
      return `${pct(r.value)} of studied concepts are due for review.`;
    case "HIGH_MARKS_WEIGHT":
      return "This unit carries a high share of exam marks.";
    case "SYLLABUS_REMAINING":
      return `${pct(r.value)} of the unit is still uncovered.`;
    case "UNVERIFIED_COVERAGE":
      return "You reported this unit as covered, but there are too few answers to confirm it.";
    case "MOVED_ON_WEAKNESS":
      return "You moved on with weak concepts still unresolved.";
    case "MOCK_DUE":
      return r.value < 0 ? "You have not taken a mock yet." : `It has been ${plural(Math.round(r.value), "day")} since your last mock.`;
    case "FLASHCARDS_DUE":
      return `${plural(Math.round(r.value), "flashcard")} due.`;
    case "NEXT_IN_SEQUENCE":
      return "This is the next unit in your syllabus order.";
    case "WITHIN_EXTENSION":
      return r.value >= 1
        ? `${plural(Math.floor(r.value), "day")} left before this unit's maximum extension.`
        : "Less than a day left before this unit's maximum extension.";
  }
}

/**
 * Turn the strongest priority contributions into reasons. PYQ weakness is added
 * whenever it is real (it lives inside the weakness component, so it would
 * otherwise be invisible).
 */
export function reasonsForPriority(s: UnitSignals, p: PriorityResult, max = 4): Reason[] {
  const MIN = 0.03;
  const map: Record<PriorityKey, () => Reason | null> = {
    weakness: () => (s.mastery != null ? { type: "LOW_MASTERY", value: s.mastery } : null),
    recent: () => (s.recentAccuracy != null ? { type: "LOW_RECENT_ACCURACY", value: s.recentAccuracy } : null),
    mistakes: () => ({ type: "REPEATED_MISTAKES", value: s.mistakes }),
    prereq: () => (s.prereqGap > 0 ? { type: "PREREQUISITE_GAP", value: s.prereqGap } : null),
    revision: () => ({ type: "REVISION_DUE", value: s.revisionDueShare }),
    importance: () => ({ type: "HIGH_MARKS_WEIGHT", value: s.marksShare }),
    remaining: () => ({ type: "SYLLABUS_REMAINING", value: 1 - s.coverage }),
  };
  const ranked = (Object.keys(p.contributions) as PriorityKey[])
    .filter((k) => p.contributions[k] >= MIN)
    .sort((a, b) => p.contributions[b] - p.contributions[a]);

  const out: Reason[] = [];
  for (const k of ranked) {
    const r = map[k]();
    if (r) out.push(r);
  }
  if (s.pyqAccuracy != null && s.pyqAttempts >= 3 && s.pyqAccuracy < 0.6 && !out.some((r) => r.type === "PYQ_WEAKNESS")) {
    out.splice(1, 0, { type: "PYQ_WEAKNESS", value: s.pyqAccuracy });
  }
  return out.slice(0, max);
}

const URGENT: ReasonType[] = [
  "LOW_MASTERY",
  "LOW_RECENT_ACCURACY",
  "PYQ_WEAKNESS",
  "REPEATED_MISTAKES",
  "REVISION_DUE",
  "PREREQUISITE_GAP",
  "MOVED_ON_WEAKNESS",
  "MOCK_DUE",
];

/** Teal means progress or new work, amber means weak or due (design.md, section 2). Never decorative. */
export function reasonTone(reasons: Reason[]): "amber" | "teal" {
  return reasons.some((r) => URGENT.includes(r.type)) ? "amber" : "teal";
}
