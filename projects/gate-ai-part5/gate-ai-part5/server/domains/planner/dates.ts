/**
 * Day arithmetic on "YYYY-MM-DD" keys. Every "what day is it" question in the
 * planner goes through dayKey(now, timezone) so day boundaries follow the
 * student's timezone, not the server's.
 */
export type DayKey = string;

export const MS_PER_DAY = 86_400_000;

export function dayKey(d: Date, tz = "UTC"): DayKey {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** For Prisma `@db.Date` values, which arrive as UTC-midnight Dates. */
export const utcKey = (d: Date): DayKey => d.toISOString().slice(0, 10);
export const keyToDate = (k: DayKey): Date => new Date(`${k}T00:00:00Z`);

export function addDays(k: DayKey, n: number): DayKey {
  const d = keyToDate(k);
  d.setUTCDate(d.getUTCDate() + n);
  return utcKey(d);
}

export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / MS_PER_DAY);
}

/** Fractional days from `from` to `to` (negative if `to` is earlier). */
export const fracDays = (from: Date, to: Date): number =>
  (to.getTime() - from.getTime()) / MS_PER_DAY;

export const addDaysToDate = (d: Date, n: number): Date => new Date(d.getTime() + n * MS_PER_DAY);

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export const round = (x: number, places = 2): number => {
  const f = 10 ** places;
  return Math.round(x * f) / f;
};
