export const MISTAKE_TYPES = [
  "CONCEPTUAL_GAP",
  "CALCULATION_ERROR",
  "MISREAD",
  "FORMULA_RECALL",
  "CONFUSED_CONCEPTS",
  "CARELESS_ERROR",
  "GUESS",
  "TIME_PRESSURE",
] as const;

export type MistakeTypeValue = (typeof MISTAKE_TYPES)[number];

export const MISTAKE_TYPE_LABELS: Record<MistakeTypeValue, string> = {
  CONCEPTUAL_GAP: "Conceptual gap",
  CALCULATION_ERROR: "Calculation error",
  MISREAD: "Misread the question",
  FORMULA_RECALL: "Forgot the formula",
  CONFUSED_CONCEPTS: "Confused two concepts",
  CARELESS_ERROR: "Careless error",
  GUESS: "Guessed",
  TIME_PRESSURE: "Ran out of time",
};

export interface MistakeFilters {
  /** A mistake type, or "UNTAGGED". */
  type?: MistakeTypeValue | "UNTAGGED";
  subjectId?: string;
  unitId?: string;
  /** "open" (default), "resolved" or "all". */
  status?: "open" | "resolved" | "all";
  limit?: number;
}
