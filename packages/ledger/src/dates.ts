// Building an Intl formatter is slow, and ledger views convert every entry's date, so keep one per zone.
const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** The shop-local calendar date ("YYYY-MM-DD") of an instant, in an IANA timezone. */
export function localDate(instant: string, timezone: string): string {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) throw new Error(`invalid instant: ${instant}`);
  let f = dateFormats.get(timezone);
  // en-CA formats as YYYY-MM-DD.
  if (!f) dateFormats.set(timezone, (f = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })));
  return f.format(ms);
}

/** An ISO instant with the timezone's offset for a local date and "HH:MM", e.g. "2026-11-06T10:30:00+01:00". */
export function instantAt(date: string, time: string, timezone: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offset = name === "GMT" ? "+00:00" : name.replace("GMT", "");
  return `${date}T${time}:00${offset}`;
}

/** The shop-local "HH:MM" of an instant. */
export function localTime(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(Date.parse(instant));
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
