import { summarizePeriod, type PeriodSummary } from "./accounting";
import { effectiveEntries } from "./corrections";
import { addDays, byOccurred, daysBetween, localDate } from "./dates";
import type { DebtState } from "./debts";
import { trustLabel, type TrustLabel, type TrustResult } from "./trust";
import type { Entry, PaymentEntry, ReplaceableEntry, SaleEntry, ShopSettings } from "./types";

/**
 * Deterministic answers the screens and the Ask agent use. The agent only ever phrases what these
 * return; it never computes money itself.
 */

export function daySummary(entries: readonly Entry[], settings: ShopSettings, date: string): PeriodSummary & { creditGivenKobo: number } {
  const p = summarizePeriod(entries, settings, date, date);
  return { ...p, creditGivenKobo: creditGiven(entries, settings, date, date) };
}

/** Credit handed out in a period: the unpaid part of each sale. */
export function creditGiven(entries: readonly Entry[], settings: ShopSettings, from: string, to: string): number {
  return effectiveEntries(entries)
    .filter((e): e is SaleEntry => e.type === "SALE")
    .filter((e) => {
      const d = localDate(e.occurredAt, settings.timezone);
      return d >= from && d <= to;
    })
    .reduce((s, e) => s + (e.totalKobo - e.paidNowKobo), 0);
}

/** The effective entries that happened on a shop-local date, in time order. */
export function entriesOn(entries: readonly Entry[], settings: ShopSettings, date: string): ReplaceableEntry[] {
  return effectiveEntries(entries)
    .filter((e) => localDate(e.occurredAt, settings.timezone) === date)
    .sort(byOccurred);
}

export interface CustomerRow {
  customerId: string;
  owedKobo: number;
  overdueKobo: number;
  creditKobo: number;
  trust: TrustResult;
}

const LABEL_RANK: Record<TrustLabel, number> = { Careful: 0, "Sometimes late": 1, New: 2, "Good payer": 3 };

/** Every customer with balance and label, most owed first, then riskiest label first. */
export function customerRows(state: DebtState, customerIds: readonly string[], overrides: Record<string, TrustLabel | undefined> = {}): CustomerRow[] {
  return customerIds
    .map((customerId) => {
      const b = state.balances.get(customerId);
      return {
        customerId,
        owedKobo: b?.owedKobo ?? 0,
        overdueKobo: b?.overdueKobo ?? 0,
        creditKobo: b?.creditKobo ?? 0,
        trust: trustLabel(state, customerId, overrides[customerId]),
      };
    })
    .sort((a, b) => b.owedKobo - a.owedKobo || b.overdueKobo - a.overdueKobo || LABEL_RANK[a.trust.label] - LABEL_RANK[b.trust.label]);
}

export function topDebtors(state: DebtState, n: number): { customerId: string; owedKobo: number; overdueKobo: number }[] {
  return [...state.balances.values()]
    .filter((b) => b.owedKobo > 0)
    .sort((a, b) => b.owedKobo - a.owedKobo)
    .slice(0, n)
    .map(({ customerId, owedKobo, overdueKobo }) => ({ customerId, owedKobo, overdueKobo }));
}

export function lastPayment(entries: readonly Entry[], customerId: string): PaymentEntry | null {
  const payments = effectiveEntries(entries).filter((e): e is PaymentEntry => e.type === "PAYMENT" && e.customerId === customerId);
  return payments.sort(byOccurred).at(-1) ?? null;
}

/** All effective entries that involve a customer, newest first. */
export function customerHistory(entries: readonly Entry[], customerId: string): ReplaceableEntry[] {
  return effectiveEntries(entries)
    .filter((e) => "customerId" in e && e.customerId === customerId)
    .sort(byOccurred)
    .reverse();
}

export interface PromiseDue {
  customerId: string;
  saleId: string;
  openKobo: number;
  dueDate: string;
  status: "paid" | "due today" | "overdue";
}

/** Debts whose due date is today, plus those already settled today that were due today. */
export function promisesDueOn(state: DebtState, date: string): PromiseDue[] {
  return state.debts
    .filter((d) => d.dueDate === date)
    .map((d) => ({
      customerId: d.customerId,
      saleId: d.saleId,
      openKobo: d.openKobo,
      dueDate: d.dueDate,
      status: d.openKobo === 0 ? ("paid" as const) : d.dueDate < state.asOf ? ("overdue" as const) : ("due today" as const),
    }));
}

/** Day-by-day totals for a date range, newest first, only days with entries. */
export function dayList(entries: readonly Entry[], settings: ShopSettings, from: string, to: string) {
  const days: { date: string; revenueKobo: number; cashCollectedKobo: number; entryCount: number }[] = [];
  const eff = effectiveEntries(entries);
  const counts = new Map<string, number>();
  for (const e of eff) {
    const d = localDate(e.occurredAt, settings.timezone);
    if (d >= from && d <= to) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  for (let d = to; d >= from; d = addDays(d, -1)) {
    const n = counts.get(d);
    if (!n) continue;
    const p = summarizePeriod(entries, settings, d, d);
    days.push({ date: d, revenueKobo: p.revenueKobo, cashCollectedKobo: p.cashCollectedKobo, entryCount: n });
  }
  return days;
}


export interface ReminderDue {
  customerId: string;
  /** Still owed on debts promised for today. */
  dueTodayKobo: number;
  /** Still owed on debts whose promised date has passed. */
  overdueKobo: number;
  /** Everything the customer owes, for the reminder's pay link. */
  owedKobo: number;
  /** Days since the oldest unpaid promised date, 0 if nothing is overdue. */
  daysOverdue: number;
}

/**
 * Who to remind today: customers with an unpaid debt promised for today, or already overdue.
 * Promised-today first, then the most overdue. Used by the Today screen and the morning emails.
 */
export function remindersDue(state: DebtState, today: string): ReminderDue[] {
  const by = new Map<string, ReminderDue>();
  for (const d of state.debts) {
    if (d.openKobo <= 0 || d.dueDate > today) continue;
    const r = by.get(d.customerId) ?? { customerId: d.customerId, dueTodayKobo: 0, overdueKobo: 0, owedKobo: state.balances.get(d.customerId)?.owedKobo ?? 0, daysOverdue: 0 };
    if (d.dueDate === today) r.dueTodayKobo += d.openKobo;
    else {
      r.overdueKobo += d.openKobo;
      r.daysOverdue = Math.max(r.daysOverdue, daysBetween(d.dueDate, today));
    }
    by.set(d.customerId, r);
  }
  return [...by.values()].sort((a, b) => Number(b.dueTodayKobo > 0) - Number(a.dueTodayKobo > 0) || b.daysOverdue - a.daysOverdue || b.owedKobo - a.owedKobo);
}
