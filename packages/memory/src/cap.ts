import { addDays, formatNaira, instantAt, monthRange } from "@trustbook/ledger";
import { behaviourNamespace, type MemoryEvent, type MemoryKind } from "./events";

/**
 * Staying inside Walrus Memory limits (brief §6.8b): a namespace must stay under 100 blobs for
 * restore to see all of it. At 90 memories in a month, per-event writes for that month are held and
 * replaced by one end-of-week summary per customer. 99 is a hard stop that no write crosses.
 */
export const SOFT_CAP = 90;
export const HARD_CAP = 99;

/** Kinds that are never held: the month's lesson and the owner's own label decisions are rare and needed whole. */
const NEVER_HELD = new Set<MemoryKind>(["month_lesson", "label_override", "week_summary"]);
export const isHoldable = (kind: MemoryKind) => !NEVER_HELD.has(kind);

/** Monday of the ISO week containing a date. */
export const weekStartOf = (date: string) => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));

interface Held {
  kind: string;
  customerId: string;
  occurredAt: string;
  content: string;
}

/**
 * One summary memory for a customer's held events in one week, worded from the events' own numbers.
 * The summary stays in the month namespace the held events belonged to.
 */
export function weekSummaryEvent(
  ctx: { shopId: string; timezone: string; demo: boolean; customerName: (id: string) => string },
  customerId: string,
  weekStart: string,
  month: string,
  held: readonly Held[],
): MemoryEvent {
  let credits = 0, creditKobo = 0, payments = 0, paidKobo = 0, late = 0, maxDaysLate = 0, broken = 0, kept = 0, promised = 0;
  for (const h of held) {
    const j = JSON.parse(h.content) as { amountKobo?: number; daysLate?: number | null };
    if (h.kind === "credit") [credits, creditKobo] = [credits + 1, creditKobo + (j.amountKobo ?? 0)];
    else if (h.kind === "payment") {
      payments += 1;
      paidKobo += j.amountKobo ?? 0;
      if ((j.daysLate ?? 0) > 0) [late, maxDaysLate] = [late + 1, Math.max(maxDaysLate, j.daysLate!)];
    } else if (h.kind === "promise_broken") broken += 1;
    else if (h.kind === "promise_kept") kept += 1;
    else if (h.kind === "promise_made") promised += 1;
  }
  const name = ctx.customerName(customerId);
  const weekEnd = addDays(weekStart, 6);
  const range = `${new Date(`${weekStart}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" })}–${new Date(`${weekEnd}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" })}`;
  const parts: string[] = [];
  if (credits) parts.push(`took ${formatNaira(creditKobo)} on credit in ${credits} sale${credits === 1 ? "" : "s"}`);
  if (payments) parts.push(`paid ${formatNaira(paidKobo)} in ${payments} payment${payments === 1 ? "" : "s"}${late ? ` (${late} late, up to ${maxDaysLate} day${maxDaysLate === 1 ? "" : "s"})` : ""}`);
  if (promised) parts.push(`made ${promised} promise${promised === 1 ? "" : "s"}`);
  if (kept) parts.push(`kept ${kept} promise${kept === 1 ? "" : "s"}`);
  if (broken) parts.push(`broke ${broken} promise${broken === 1 ? "" : "s"}`);
  const summary = `Week of ${range}: ${name} ${parts.join(", ") || "had no recorded activity"}.`;
  // Dated inside its month, even when the week runs past the month's end.
  const monthEnd = monthRange(month).to;
  const occurredAt = instantAt(weekEnd < monthEnd ? weekEnd : monthEnd, "23:59", ctx.timezone);
  const body = {
    v: 1,
    kind: "week_summary",
    shopId: ctx.shopId,
    customerId,
    customerName: name,
    occurredAt,
    weekStart,
    weekEnd,
    month,
    counts: { credits, payments, late, promised, kept, broken },
    creditKobo,
    paidKobo,
    maxDaysLate,
    ...(ctx.demo ? { demo: true } : {}),
    summary,
  };
  return { kind: "week_summary", customerId, occurredAt, dedupeKey: `week:${customerId}:${weekStart}:${month}`, content: JSON.stringify(body), namespace: behaviourNamespace(ctx.shopId, month) };
}
