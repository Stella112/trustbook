import { effectiveEntries } from "./corrections";
import { addDays, localDate } from "./dates";
import type { Entry, ShopSettings } from "./types";

/**
 * Who the shop owes (approved 7 Nov: supplier payables). Built only from the ledger: PURCHASE entries
 * create bills for any part not paid at once, SUPPLIER_PAYMENT entries pay them off oldest first.
 * Paying a supplier never counts as another purchase or an expense.
 */
export interface SupplierBill {
  entryId: string;
  date: string;
  totalKobo: number;
  /** Paid at purchase time plus later payments allocated to this bill. */
  paidKobo: number;
  openKobo: number;
  dueDate?: string;
  overdue: boolean;
}

export interface SupplierAccount {
  /** Lower-cased name, so "Alhaji" and "alhaji " are one supplier. */
  key: string;
  name: string;
  purchasesKobo: number;
  paidKobo: number;
  owedKobo: number;
  overdueKobo: number;
  /** Paid more than owed: kept as credit with the supplier, never lost. */
  creditKobo: number;
  bills: SupplierBill[];
  payments: { entryId: string; date: string; amountKobo: number }[];
  lastPurchaseDate: string | null;
  /** Earliest due date among unpaid bills. */
  nextDueDate: string | null;
}

export const NO_SUPPLIER = "No supplier named";
export const supplierKey = (name: string | undefined) => (name ?? "").trim().replace(/\s+/g, " ").toLowerCase() || NO_SUPPLIER.toLowerCase();

export function supplierAccounts(entries: readonly Entry[], settings: ShopSettings, today: string): SupplierAccount[] {
  const accounts = new Map<string, SupplierAccount>();
  const account = (name: string | undefined) => {
    const key = supplierKey(name);
    let a = accounts.get(key);
    if (!a) {
      a = { key, name: name?.trim() || NO_SUPPLIER, purchasesKobo: 0, paidKobo: 0, owedKobo: 0, overdueKobo: 0, creditKobo: 0, bills: [], payments: [], lastPurchaseDate: null, nextDueDate: null };
      accounts.set(key, a);
    }
    return a;
  };
  const ordered = [...effectiveEntries(entries)].sort((x, y) => (x.occurredAt < y.occurredAt ? -1 : x.occurredAt > y.occurredAt ? 1 : x.id < y.id ? -1 : 1));
  for (const e of ordered) {
    const date = localDate(e.occurredAt, settings.timezone);
    if (e.type === "PURCHASE") {
      const a = account(e.supplier);
      a.purchasesKobo += e.totalKobo;
      a.paidKobo += e.paidNowKobo;
      a.lastPurchaseDate = date;
      const bill: SupplierBill = { entryId: e.id, date, totalKobo: e.totalKobo, paidKobo: e.paidNowKobo, openKobo: e.totalKobo - e.paidNowKobo, dueDate: e.dueDate, overdue: false };
      // Credit already held with the supplier pays the new bill first.
      const fromCredit = Math.min(a.creditKobo, bill.openKobo);
      bill.paidKobo += fromCredit;
      bill.openKobo -= fromCredit;
      a.creditKobo -= fromCredit;
      a.bills.push(bill);
    } else if (e.type === "SUPPLIER_PAYMENT") {
      const a = account(e.supplier);
      a.paidKobo += e.amountKobo;
      a.payments.push({ entryId: e.id, date, amountKobo: e.amountKobo });
      let left = e.amountKobo;
      for (const b of a.bills) {
        if (!left) break;
        const pay = Math.min(left, b.openKobo);
        b.paidKobo += pay;
        b.openKobo -= pay;
        left -= pay;
      }
      a.creditKobo += left;
    }
  }
  for (const a of accounts.values()) {
    a.owedKobo = a.bills.reduce((s, b) => s + b.openKobo, 0);
    for (const b of a.bills) {
      b.overdue = b.openKobo > 0 && b.dueDate !== undefined && b.dueDate < today;
      if (b.overdue) a.overdueKobo += b.openKobo;
    }
    a.nextDueDate = a.bills.filter((b) => b.openKobo > 0 && b.dueDate).map((b) => b.dueDate!).sort()[0] ?? null;
  }
  // Most owed first, then most recent purchase.
  return [...accounts.values()].sort((x, y) => y.owedKobo - x.owedKobo || (y.lastPurchaseDate ?? "").localeCompare(x.lastPurchaseDate ?? ""));
}

/** Totals for the Suppliers screen: owed, how many suppliers, overdue, and due in the next week. */
export function supplierSummary(accounts: readonly SupplierAccount[], today: string) {
  const weekEnd = addDays(today, 7);
  const open = accounts.flatMap((a) => a.bills.filter((b) => b.openKobo > 0).map((b) => ({ ...b, supplier: a.name })));
  return {
    owedKobo: accounts.reduce((s, a) => s + a.owedKobo, 0),
    suppliersOwed: accounts.filter((a) => a.owedKobo > 0).length,
    overdueKobo: accounts.reduce((s, a) => s + a.overdueKobo, 0),
    dueSoon: open.filter((b) => b.dueDate && b.dueDate >= today && b.dueDate <= weekEnd).sort((x, y) => x.dueDate!.localeCompare(y.dueDate!)),
    overdue: open.filter((b) => b.overdue).sort((x, y) => x.dueDate!.localeCompare(y.dueDate!)),
  };
}
