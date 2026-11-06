import { addDays, formatNaira, instantAt, monthRange, monthSummary, topDebtors, computeDebts, effectiveEntries, type Entry, type ShopSettings } from "@trustbook/ledger";
import { monthLessonEvent, type MemoryEvent } from "@trustbook/memory";

const monthName = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });

function change(now: number, before: number): string {
  if (before === 0) return now === 0 ? "no change" : "up from nothing";
  const pct = Math.round(((now - before) * 100) / before);
  return pct === 0 ? "about the same as" : `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on`;
}

/**
 * The lesson for a closed month (brief §6.7), worded from computed numbers only. Returns the memory
 * to queue and the plain text shown to the owner.
 */
export function buildMonthLesson(entries: readonly Entry[], settings: ShopSettings, month: string, demo: boolean, customerName: (id: string) => string): { text: string; event: MemoryEvent } {
  const prevMonth = addDays(monthRange(month).from, -1).slice(0, 7);
  const now = monthSummary(entries, settings, month);
  const before = monthSummary(entries, settings, prevMonth);
  const end = monthRange(month).to;
  const debts = computeDebts(effectiveEntries(entries), settings, end);
  const top = topDebtors(debts, 1)[0];

  const parts = [`${monthName(month)}: sales ${formatNaira(now.period.revenueKobo)}, ${change(now.period.revenueKobo, before.period.revenueKobo)} ${before.period.revenueKobo ? monthName(prevMonth) : ""}`.trim() + "."];
  parts.push(now.period.netProfitKobo === null ? `Profit unavailable: ${now.period.itemsWithoutCost.length} items had no cost price.` : `Profit after expenses ${formatNaira(now.period.netProfitKobo)}.`);
  parts.push(`Owed to you went from ${formatNaira(before.position.receivablesKobo)} to ${formatNaira(now.position.receivablesKobo)}${now.position.overdueKobo ? `, with ${formatNaira(now.position.overdueKobo)} overdue` : ""}.`);
  const collectedShare = now.period.revenueKobo ? Math.round((now.period.cashCollectedKobo * 100) / now.period.revenueKobo) : 100;
  parts.push(collectedShare >= 95 ? "Collections kept pace with sales." : `Collections are lagging: you collected ${collectedShare}% of what you sold.`);
  if (top) parts.push(`${customerName(top.customerId)} owed the most (${formatNaira(top.owedKobo)}).`);
  const text = parts.join(" ");

  const event = monthLessonEvent(
    { shopId: settings.shopId, settings, today: end, demo, customerName },
    month,
    text,
    {
      revenueKobo: now.period.revenueKobo,
      previousRevenueKobo: before.period.revenueKobo,
      netProfitKobo: now.period.netProfitKobo,
      receivablesKobo: now.position.receivablesKobo,
      previousReceivablesKobo: before.position.receivablesKobo,
      overdueKobo: now.position.overdueKobo,
      collectedKobo: now.period.cashCollectedKobo,
    },
    instantAt(end, "23:59", settings.timezone),
  );
  return { text, event };
}
