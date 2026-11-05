/** The shop-local calendar date ("YYYY-MM-DD") of an instant, in an IANA timezone. */
export function localDate(instant: string, timezone: string): string {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) throw new Error(`invalid instant: ${instant}`);
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** First and last local date of a "YYYY-MM" month. */
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Stable order: when it happened, then when it was recorded, then id. */
export interface Ordered {
  occurredAt: string;
  recordedAt: string;
  id: string;
}

export function byOccurred(a: Ordered, b: Ordered): number {
  return (
    Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
    Date.parse(a.recordedAt) - Date.parse(b.recordedAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
