export interface ReasonLike {
  type: string;
  value: number | boolean;
}

const pct = (v: number | boolean) => `${Math.round(Number(v) * 100)}%`;

const TEXT: Record<string, (v: number | boolean) => string> = {
  LOW_PRACTICE_ACCURACY: (v) => `Practice accuracy is ${pct(v)}`,
  LOW_PYQ_ACCURACY: (v) => `PYQ accuracy is ${pct(v)}`,
  LOW_RECENT_ACCURACY: (v) => `Recent accuracy is ${pct(v)}`,
  LOW_MASTERY: (v) => `Mastery is ${pct(v)}`,
  OPEN_MISTAKES: (v) => `${v} mistakes still open`,
  PREREQUISITE_GAPS: (v) => `${v} weak prerequisite ${Number(v) === 1 ? "concept" : "concepts"}`,
  INSUFFICIENT_EVIDENCE: () => "Needs more questions attempted",
  COVERAGE_BELOW_REQUIRED: () => "Some topics are not covered yet",
  LOW_RETENTION: (v) => `Retention has dropped to ${pct(v)}`,
  USER_WANTS_TO_CONTINUE: () => "You chose to keep working on this unit",
};

/** The first weakness worth showing, in the order the evaluator emitted them. */
export function primaryReason(reasons: ReasonLike[]): string | null {
  for (const r of reasons) { const fn = TEXT[r.type]; if (fn) return fn(r.value); }
  return null;
}
