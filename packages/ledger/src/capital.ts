import { positionAt, summarizePeriod, type Position } from "./accounting";
import { effectiveEntries } from "./corrections";
import { localDate } from "./dates";
import type { Entry, ShopSettings } from "./types";

/**
 * Capital & Profit (approved 7 Nov): has the owner got their money back, made a profit, and how much
 * can safely go on new stock? Every figure comes from the ledger through positionAt and
 * summarizePeriod, so it agrees with the rest of the book.
 */
export interface CapitalReport {
  asOf: string;
  /** Opening cash + money the owner added − money the owner took out. */
  capitalInKobo: number;
  openingKobo: number;
  addedKobo: number;
  withdrawnKobo: number;
  /** Cash in the shop plus the shop's Sui wallet: money actually in hand. Unpaid credit is not cash. */
  cashInHandKobo: number;
  /** Capital back in hand as cash, never more than the capital put in. */
  recoveredKobo: number;
  /** Capital not yet back as cash: sitting in stock or in customers' debts. */
  toRecoverKobo: number;
  stockValueKobo: number;
  receivablesKobo: number;
  supplierOwedKobo: number;
  /** All time, from real cost prices; null when any sold item has no cost price. */
  revenueKobo: number;
  cogsKobo: number | null;
  grossProfitKobo: number | null;
  expensesKobo: number;
  netProfitKobo: number | null;
  itemsWithoutCost: string[];
  stockWarnings: Position["stockWarnings"];
  /** Cash in hand minus everything owed to suppliers, never below zero. Receivables are not counted. */
  safeToRestockKobo: number;
}

export function capitalReport(entries: readonly Entry[], settings: ShopSettings, asOf: string): CapitalReport {
  const eff = effectiveEntries(entries).filter((e) => localDate(e.occurredAt, settings.timezone) <= asOf);
  let added = 0;
  let withdrawn = 0;
  let first = asOf;
  for (const e of eff) {
    if (e.type === "OWNER_IN") added += e.amountKobo;
    if (e.type === "OWNER_OUT") withdrawn += e.amountKobo;
    const d = localDate(e.occurredAt, settings.timezone);
    if (d < first) first = d;
  }
  const pos = positionAt(entries, settings, asOf);
  const period = summarizePeriod(entries, settings, first, asOf);
  const capitalIn = settings.openingCashKobo + added - withdrawn;
  const cashInHand = pos.cashOnHandKobo + pos.suiWalletKobo;
  const recovered = Math.max(0, Math.min(capitalIn, cashInHand));
  return {
    asOf,
    capitalInKobo: capitalIn,
    openingKobo: settings.openingCashKobo,
    addedKobo: added,
    withdrawnKobo: withdrawn,
    cashInHandKobo: cashInHand,
    recoveredKobo: recovered,
    toRecoverKobo: Math.max(0, capitalIn - recovered),
    stockValueKobo: pos.stockValueKobo,
    receivablesKobo: pos.receivablesKobo,
    supplierOwedKobo: pos.supplierOwedKobo,
    revenueKobo: period.revenueKobo,
    cogsKobo: period.cogsKobo,
    grossProfitKobo: period.grossProfitKobo,
    expensesKobo: period.expensesKobo,
    netProfitKobo: period.netProfitKobo,
    itemsWithoutCost: period.itemsWithoutCost,
    stockWarnings: pos.stockWarnings,
    safeToRestockKobo: Math.max(0, cashInHand - pos.supplierOwedKobo),
  };
}
