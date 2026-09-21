/** Display helpers shared by the mock pages. Pure. */

/** The app is a personal tool for one student; dates render in their timezone, not the server's. */
export const APP_TZ = 'Asia/Kolkata';

export function pct(v: number | null | undefined, digits = 0): string {
  return v === null || v === undefined || Number.isNaN(v) ? '–' : `${(v * 100).toFixed(digits)}%`;
}

/** 41.3333 → "41.33", 3 → "3", -0.3333 → "−0.33" */
export function marks(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r).replace('-', '−');
}

/** 9060 → "2h 31m", 2700 → "45m", 40 → "40s" */
export function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function shortDate(ms: number): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: APP_TZ }).format(new Date(ms));
}

export function formatAnswer(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'Not answered';
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'Not answered';
  if (typeof v === 'object') {
    const o = v as { min?: unknown; max?: unknown };
    if (o.min !== undefined && o.max !== undefined) return `${o.min} to ${o.max}`;
    return JSON.stringify(v);
  }
  return String(v);
}
