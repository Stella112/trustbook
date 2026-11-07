import { effectiveEntries } from "./corrections";
import { byOccurred, localDate, monthRange } from "./dates";
import { computeDebts } from "./debts";
import { lineTotal, mulDivRound, type Entry, type PurchaseEntry, type ReplaceableEntry, type SaleEntry, type ShopSettings } from "./types";

const milli = (qty: number) => Math.round(qty * 1000);

export interface PeriodSummary {
  from: string;
  to: string;
  revenueKobo: number;
  cashCollectedKobo: number;
  expensesKobo: number;
  purchasesKobo: number;
  salesCount: number;
  /** Null when any sold item has no known cost price. */
  cogsKobo: number | null;
  grossProfitKobo: number | null;
  netProfitKobo: number | null;
  /** Items sold in the period with no purchase price recorded before the sale. */
  itemsWithoutCost: string[];
}

export interface Position {
  asOf: string;
  /** Cash in the shop. Sui payments are excluded: they land in the shop's Sui wallet (approved 6 Nov). */
  cashOnHandKobo: number;
  /** Naira value, at the payment's rate, of debts paid by Sui into the shop's wallet. */
  suiWalletKobo: number;
  stockValueKobo: number;
  /** Items in stock whose value is unknown (no purchase price), or that show negative stock. */
  stockWarnings: { itemId: string; problem: "no cost price" | "negative stock" }[];
  receivablesKobo: number;
  overdueKobo: number;
  /** Overpayments held for customers. Reported, not netted, to follow the brief's formula. */
  customerCreditKobo: number;
  supplierOwedKobo: number;
  /** Cash + Sui wallet + stock + receivables − supplier balances. An estimate: label it so in the UI. */
  netPositionKobo: number;
}

/** Weighted average cost basis from purchases at or before `at`: total cost kobo and total qty in thousandths. */
function costBasis(purchases: readonly PurchaseEntry[], itemId: string, at: SaleEntry | null): { costKobo: number; qtyMilli: number } {
  let costKobo = 0;
  let qtyMilli = 0;
  for (const p of purchases) {
    if (at && byOccurred(p, at) > 0) continue;
    for (const line of p.items) {
      if (line.itemId !== itemId) continue;
      costKobo += lineTotal(line.qty, line.unitCostKobo);
      qtyMilli += milli(line.qty);
    }
  }
  return { costKobo, qtyMilli };
}

export function summarizePeriod(entries: readonly Entry[], settings: ShopSettings, from: string, to: string): PeriodSummary {
  const eff = effectiveEntries(entries);
  const inPeriod = (e: ReplaceableEntry) => {
    const d = localDate(e.occurredAt, settings.timezone);
    return d >= from && d <= to;
  };
  const purchases = eff.filter((e): e is PurchaseEntry => e.type === "PURCHASE");
  let revenue = 0, cash = 0, expenses = 0, bought = 0, salesCount = 0, cogs = 0;
  const missing = new Set<string>();
  for (const e of eff) {
    if (!inPeriod(e)) continue;
    if (e.type === "SALE") {
      revenue += e.totalKobo;
      cash += e.paidNowKobo;
      salesCount++;
      for (const line of e.items) {
        const basis = costBasis(purchases, line.itemId, e);
        if (basis.qtyMilli === 0) missing.add(line.itemId);
        else cogs += mulDivRound(milli(line.qty), basis.costKobo, basis.qtyMilli);
      }
    } else if (e.type === "PAYMENT") cash += e.amountKobo;
    else if (e.type === "EXPENSE") expenses += e.amountKobo;
    else if (e.type === "PURCHASE") bought += e.totalKobo;
  }
  const complete = missing.size === 0;
  return {
    from,
    to,
    revenueKobo: revenue,
    cashCollectedKobo: cash,
    expensesKobo: expenses,
    purchasesKobo: bought,
    salesCount,
    cogsKobo: complete ? cogs : null,
    grossProfitKobo: complete ? revenue - cogs : null,
    netProfitKobo: complete ? revenue - cogs - expenses : null,
    itemsWithoutCost: [...missing].sort(),
  };
}

export function positionAt(entries: readonly Entry[], settings: ShopSettings, asOf: string): Position {
  const eff = effectiveEntries(entries).filter((e) => localDate(e.occurredAt, settings.timezone) <= asOf);
  let cash = settings.openingCashKobo;
  let suiWallet = 0;
  let supplierOwed = 0;
  const onHand = new Map<string, number>();
  const move = (itemId: string, deltaMilli: number) => onHand.set(itemId, (onHand.get(itemId) ?? 0) + deltaMilli);
  for (const e of eff) {
    switch (e.type) {
      case "SALE":
        cash += e.paidNowKobo;
        for (const l of e.items) move(l.itemId, -milli(l.qty));
        break;
      case "PAYMENT":
        if (e.method === "sui") suiWallet += e.amountKobo;
        else cash += e.amountKobo;
        break;
      case "SUPPLIER_PAYMENT":
        cash -= e.amountKobo;
        supplierOwed -= e.amountKobo;
        break;
      case "PURCHASE":
        cash -= e.paidNowKobo;
        supplierOwed += e.totalKobo - e.paidNowKobo;
        for (const l of e.items) move(l.itemId, milli(l.qty));
        break;
      case "EXPENSE":
        cash -= e.amountKobo;
        break;
      case "OWNER_IN":
        cash += e.amountKobo;
        break;
      case "OWNER_OUT":
        cash -= e.amountKobo;
        break;
      case "STOCK_ADJUST":
        move(e.itemId, milli(e.qtyDelta));
        break;
      case "PROMISE":
        break;
    }
  }
  const purchases = eff.filter((e): e is PurchaseEntry => e.type === "PURCHASE");
  let stockValue = 0;
  const warnings: Position["stockWarnings"] = [];
  for (const [itemId, qtyMilli] of [...onHand].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (qtyMilli < 0) warnings.push({ itemId, problem: "negative stock" });
    if (qtyMilli <= 0) continue;
    const basis = costBasis(purchases, itemId, null);
    if (basis.qtyMilli === 0) warnings.push({ itemId, problem: "no cost price" });
    else stockValue += mulDivRound(qtyMilli, basis.costKobo, basis.qtyMilli);
  }
  const debts = computeDebts(eff, settings, asOf);
  let receivables = 0, overdue = 0, customerCredit = 0;
  for (const b of debts.balances.values()) {
    receivables += b.owedKobo;
    overdue += b.overdueKobo;
    customerCredit += b.creditKobo;
  }
  return {
    asOf,
    cashOnHandKobo: cash,
    suiWalletKobo: suiWallet,
    stockValueKobo: stockValue,
    stockWarnings: warnings,
    receivablesKobo: receivables,
    overdueKobo: overdue,
    customerCreditKobo: customerCredit,
    supplierOwedKobo: supplierOwed,
    netPositionKobo: cash + suiWallet + stockValue + receivables - supplierOwed,
  };
}

/**
 * A month's totals, and the shop's position at the month's end. For the current month pass `asOf`
 * (today), so totals and overdue amounts stop at today rather than a future month end.
 */
export function monthSummary(entries: readonly Entry[], settings: ShopSettings, month: string, asOf?: string) {
  const range = monthRange(month);
  const to = asOf && asOf < range.to ? asOf : range.to;
  return { month, period: summarizePeriod(entries, settings, range.from, to), position: positionAt(entries, settings, to) };
}

export interface ProductProfit {
  itemId: string;
  qtyMilli: number;
  revenueKobo: number;
  /** Null when any sale of this item had no cost price recorded before it. */
  cogsKobo: number | null;
  grossProfitKobo: number | null;
}

/**
 * Profit per product in a period (approved 7 Nov: Capital & Profit), using the same weighted-average
 * cost rule as COGS. A product with any sale lacking a known cost shows no profit, never a guess.
 */
export function productProfit(entries: readonly Entry[], settings: ShopSettings, from: string, to: string): ProductProfit[] {
  const eff = effectiveEntries(entries);
  const purchases = eff.filter((e): e is PurchaseEntry => e.type === "PURCHASE");
  const rows = new Map<string, { qtyMilli: number; revenueKobo: number; cogsKobo: number; complete: boolean }>();
  for (const e of eff) {
    if (e.type !== "SALE") continue;
    const d = localDate(e.occurredAt, settings.timezone);
    if (d < from || d > to) continue;
    for (const line of e.items) {
      const r = rows.get(line.itemId) ?? { qtyMilli: 0, revenueKobo: 0, cogsKobo: 0, complete: true };
      r.qtyMilli += milli(line.qty);
      r.revenueKobo += lineTotal(line.qty, line.unitPriceKobo);
      const basis = costBasis(purchases, line.itemId, e);
      if (basis.qtyMilli === 0) r.complete = false;
      else r.cogsKobo += mulDivRound(milli(line.qty), basis.costKobo, basis.qtyMilli);
      rows.set(line.itemId, r);
    }
  }
  return [...rows]
    .map(([itemId, r]) => ({ itemId, qtyMilli: r.qtyMilli, revenueKobo: r.revenueKobo, cogsKobo: r.complete ? r.cogsKobo : null, grossProfitKobo: r.complete ? r.revenueKobo - r.cogsKobo : null }))
    .sort((a, b) => b.revenueKobo - a.revenueKobo);
}
