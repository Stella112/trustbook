import { addDays, monthRange } from "./dates";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, "");
  return MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)));
}

function weekdayIndex(word: string): number {
  const w = word.toLowerCase();
  return WEEKDAYS.findIndex((d) => d === w || (w.length >= 3 && d.startsWith(w)));
}

/**
 * Resolves a spoken date phrase to a shop-local date, in code rather than by the language model.
 * `direction` decides bare weekdays and month-days: "future" for promises ("he go pay Friday" means
 * the next Friday), "past" for questions ("wetin happen on Saturday" means the last one).
 * Returns null when the phrase is not understood, so the caller can ask.
 */
export function resolveDate(phrase: string, today: string, direction: "future" | "past"): string | null {
  const p = phrase.trim().toLowerCase().replace(/[,]/g, " ").replace(/\s+/g, " ").replace(/^(?:on|by|for|before) /, "").replace(/^dis /, "this ");
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  if (p === "today" || p === "now" || p === "tonight") return today;
  if (p === "yesterday" || p === "yesterday night") return addDays(today, -1);
  if (p === "tomorrow" || p === "tmrw" || p === "tomorrow morning") return addDays(today, 1);
  if (p === "next tomorrow" || p === "day after tomorrow") return addDays(today, 2);

  const inDays = /^in (\d{1,2}) days?$/.exec(p);
  if (inDays) return addDays(today, Number(inDays[1]));
  const daysAgo = /^(\d{1,2}) days? ago$/.exec(p);
  if (daysAgo) return addDays(today, -Number(daysAgo[1]));
  if (p === "next week") return addDays(today, 7);

  // "friday", "next friday", "last saturday", "this monday"
  const wd = /^(?:(next|last|this) )?([a-z]+)$/.exec(p);
  if (wd && weekdayIndex(wd[2]!) >= 0) {
    const target = weekdayIndex(wd[2]!);
    const now = weekday(today);
    const mod = (n: number) => ((n % 7) + 7) % 7;
    if (wd[1] === "last" || (!wd[1] && direction === "past")) return addDays(today, -(mod(now - target) || 7));
    if (wd[1] === "this" && direction === "past") return addDays(today, -mod(now - target));
    return addDays(today, mod(target - now) || 7);
  }

  // "14 october", "14th oct", "october 14", "14/10", "14/10/2026"
  const dm = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z.]+)(?: (\d{4}))?$/.exec(p) ?? null;
  const md = /^([a-z.]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/.exec(p) ?? null;
  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(p);
  let day: number | undefined, month: number | undefined, year: number | undefined;
  if (dm && monthIndex(dm[2]!) >= 0) [day, month, year] = [Number(dm[1]), monthIndex(dm[2]!), dm[3] ? Number(dm[3]) : undefined];
  else if (md && monthIndex(md[1]!) >= 0) [day, month, year] = [Number(md[2]), monthIndex(md[1]!), md[3] ? Number(md[3]) : undefined];
  else if (slash) {
    // Nigerian convention: day first.
    [day, month] = [Number(slash[1]), Number(slash[2]) - 1];
    if (slash[3]) year = slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
  }
  if (day !== undefined && month !== undefined && month >= 0 && month < 12) {
    const build = (y: number) => {
      const d = `${y}-${String(month! + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return monthRange(d.slice(0, 7)).to >= d && day! >= 1 ? d : null;
    };
    const thisYear = Number(today.slice(0, 4));
    if (year) return build(year);
    const candidate = build(thisYear);
    if (!candidate) return null;
    if (direction === "past" && candidate > today) return build(thisYear - 1);
    if (direction === "future" && candidate < today) return build(thisYear + 1);
    return candidate;
  }
  return null;
}

/** Resolves period phrases for questions: "this week", "last week", "this month", "last month", "October". */
export function resolvePeriod(phrase: string, today: string): { from: string; to: string } | null {
  const p = phrase.trim().toLowerCase();
  const mondayOffset = (weekday(today) + 6) % 7;
  const thisMonday = addDays(today, -mondayOffset);
  if (p === "this week") return { from: thisMonday, to: today };
  if (p === "last week") return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
  if (p === "this month") return { from: monthRange(today.slice(0, 7)).from, to: today };
  if (p === "last month") return monthRange(addDays(monthRange(today.slice(0, 7)).from, -1).slice(0, 7));
  const m = /^([a-z]+)(?: (\d{4}))?$/.exec(p);
  if (m && monthIndex(m[1]!) >= 0) {
    let y = m[2] ? Number(m[2]) : Number(today.slice(0, 4));
    const mm = String(monthIndex(m[1]!) + 1).padStart(2, "0");
    if (!m[2] && `${y}-${mm}` > today.slice(0, 7)) y -= 1;
    const r = monthRange(`${y}-${mm}`);
    return { from: r.from, to: r.to < today ? r.to : today };
  }
  const day = resolveDate(p, today, "past");
  return day ? { from: day, to: day } : null;
}
