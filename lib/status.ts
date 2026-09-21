import { ui } from "./ui-tokens";

export type UnitStatusValue =
  | "NOT_STARTED"
  | "LEARNING"
  | "PRACTICING"
  | "PROVISIONALLY_COMPLETE"
  | "MASTERED"
  | "REVISION_DUE";

export const STATUS_LABELS: Record<UnitStatusValue, string> = {
  NOT_STARTED: "Not started",
  LEARNING: "Learning",
  PRACTICING: "Practicing",
  PROVISIONALLY_COMPLETE: "Provisionally complete",
  MASTERED: "Mastered",
  REVISION_DUE: "Revision due",
};

/** Teal = progress, amber = needs attention, slate = quiet. Never decorative. */
export const STATUS_TEXT: Record<UnitStatusValue, string> = {
  NOT_STARTED: ui.slate,
  LEARNING: ui.slate,
  PRACTICING: ui.amber,
  PROVISIONALLY_COMPLETE: ui.teal,
  MASTERED: ui.teal,
  REVISION_DUE: ui.amber,
};

/** Two-letter subject code: "Operating Systems" -> OS, "Algorithms" -> AL. */
export function subjectCode(name: string): string {
  const words = name.split(/[\s&,/-]+/).filter(Boolean);
  const code = words.length > 1 ? (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "") : name.slice(0, 2);
  return code.toUpperCase();
}

/** Stable badge colour per subject. */
export function badgeIndex(key: string, size: number): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % size;
}
