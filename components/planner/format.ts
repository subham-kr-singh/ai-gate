import type { Candidate, PlannerAction, Reason } from "@/server/domains/planner/planner.types";
import { ACTION_LABEL, describeReason, reasonTone } from "@/server/domains/planner/reasons";
import { palette } from "@/lib/design-tokens";
import { PASTEL_CLASS, PASTEL_HEX } from "@/components/ui/tokens";

export { ACTION_LABEL, describeReason, reasonTone };

export const pct = (v: number | null | undefined, empty = "None yet") => (v == null ? empty : `${Math.round(v * 100)}%`);

export function formatDay(key: string | null | undefined): string {
  if (!key) return "Not set";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${key}T00:00:00Z`));
}

export function formatDayShort(key: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${key}T00:00:00Z`));
}

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * The seven day keys of the week containing `todayKey` (Mon-first). Built off
 * the plan's own day key so the strip, "days to exam" and the phase bar all
 * agree on what "today" is, even when the student's timezone differs from the
 * server's.
 */
export function weekDays(todayKey: string): { key: string; weekday: string; dayOfMonth: string; isToday: boolean }[] {
  const today = new Date(`${todayKey}T00:00:00Z`);
  // getUTCDay: 0 = Sunday. Shift so Monday is the first column.
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - mondayOffset);
  return WEEKDAY.map((weekday, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    return { key, weekday, dayOfMonth: String(d.getUTCDate()), isToday: key === todayKey };
  });
}

/** One plain sentence saying what to do. */
export function headline(c: Candidate): string {
  const focus = c.conceptName ?? c.unitName ?? "";
  const unit = c.unitName ?? "";
  const map: Record<PlannerAction, string> = {
    STUDY_CONCEPT: `Study ${focus}.`,
    REVISE_CONCEPT: `Revise ${focus}.`,
    SOLVE_EASY: `Rebuild the basics of ${focus || unit}.`,
    SOLVE_MEDIUM: `Solve medium questions in ${unit}.`,
    SOLVE_HARD: `Solve hard questions in ${unit}.`,
    REVIEW_MISTAKES: `Review your open mistakes in ${unit}.`,
    TAKE_MINI_TEST: `Take a check quiz on ${unit}.`,
    TAKE_TOPIC_TEST: `Take the mastery check for ${unit}.`,
    TAKE_MOCK: "Take a full mock.",
    FLASHCARD_REVIEW: "Review your due flashcards.",
  };
  return map[c.action];
}

/** Short right-hand value for a reason row, e.g. "42%". */
export function reasonValue(r: Reason): string {
  switch (r.type) {
    case "LOW_MASTERY":
    case "LOW_RECENT_ACCURACY":
    case "PYQ_WEAKNESS":
    case "PREREQUISITE_GAP":
    case "REVISION_DUE":
    case "SYLLABUS_REMAINING":
    case "HIGH_MARKS_WEIGHT":
      return `${Math.round(r.value * 100)}%`;
    case "REPEATED_MISTAKES":
    case "MOVED_ON_WEAKNESS":
    case "FLASHCARDS_DUE":
      return String(Math.round(r.value));
    case "MOCK_DUE":
      return r.value < 0 ? "None" : `${Math.round(r.value)}d`;
    case "WITHIN_EXTENSION":
      return r.value >= 1 ? `${Math.floor(r.value)}d left` : "<1d left";
    case "NEXT_IN_SEQUENCE":
      return "Next";
    case "UNVERIFIED_COVERAGE":
      return "Unproven";
  }
}

/* Subject badges: two-letter code on a pastel fill (design.md section 5). */
const SUBJECTS: [RegExp, string, keyof typeof PASTEL_CLASS][] = [
  [/aptitude/i, "GA", "lavender"],
  [/mathematics|discrete/i, "DM", "sky"],
  [/theory of computation/i, "TC", "lavender"],
  [/digital/i, "DL", "mint"],
  [/organi[sz]ation|architecture/i, "CO", "butter"],
  [/programming|data structures/i, "PD", "sky"],
  [/algorithm/i, "AL", "mint"],
  [/compiler/i, "CD", "lavender"],
  [/operating/i, "OS", "coral"],
  [/database/i, "DB", "butter"],
  [/network/i, "CN", "sky"],
];

export type PastelTone = "butter" | "sky" | "lavender" | "coral" | "mint";

export { PASTEL_CLASS, PASTEL_HEX };

export function subjectBadge(name: string | null): { code: string; fill: string } {
  const hit = name ? SUBJECTS.find(([re]) => re.test(name)) : undefined;
  if (hit) return { code: hit[1], fill: PASTEL_CLASS[hit[2]] };
  return { code: (name ?? "GA").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "GA", fill: PASTEL_CLASS.butter };
}
