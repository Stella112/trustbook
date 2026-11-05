import { addDays, byOccurred, localDate } from "./dates";
import type { ReplaceableEntry, ShopSettings } from "./types";

export interface Debt {
  saleId: string;
  customerId: string;
  saleDate: string;
  creditKobo: number;
  paidKobo: number;
  openKobo: number;
  dueDate: string;
  /** Local date the debt was fully paid, if it was. */
  settledDate?: string;
}

export interface PromiseRecord {
  customerId: string;
  saleIds: string[];
  promisedDate: string;
  madeOn: string;
  /** True when every debt it covers was fully paid by the end of the promised date. */
  kept: boolean;
}

export interface CustomerBalance {
  customerId: string;
  owedKobo: number;
  /** Money paid beyond what was owed, kept for the customer rather than lost. */
  creditKobo: number;
  overdueKobo: number;
}

export interface DebtState {
  asOf: string;
  debts: Debt[];
  promises: PromiseRecord[];
  balances: Map<string, CustomerBalance>;
  /** How each payment was actually applied. */
  appliedAllocations: Map<string, { saleId: string; amountKobo: number }[]>;
}

/**
 * Replays credit sales, promises and payments up to and including `asOf` (a shop-local date).
 * A payment goes first to the debts its allocations name, then oldest-first; any remainder becomes
 * customer credit. Allocations naming a reversed or unknown sale fall through to oldest-first.
 */
export function computeDebts(effective: readonly ReplaceableEntry[], settings: ShopSettings, asOf: string): DebtState {
  const tz = settings.timezone;
  const debts = new Map<string, Debt>();
  const promises: PromiseRecord[] = [];
  const credit = new Map<string, number>();
  const applied = new Map<string, { saleId: string; amountKobo: number }[]>();

  const openDebtsOf = (customerId: string) =>
    [...debts.values()].filter((d) => d.customerId === customerId && d.openKobo > 0);
  const pay = (d: Debt, amount: number, on: string) => {
    d.paidKobo += amount;
    d.openKobo -= amount;
    if (d.openKobo === 0) d.settledDate = on;
  };
  const addPromise = (customerId: string, saleIds: string[], promisedDate: string, madeOn: string) => {
    if (saleIds.length) promises.push({ customerId, saleIds, promisedDate, madeOn, kept: false });
  };

  const ordered = effective.filter((e) => localDate(e.occurredAt, tz) <= asOf).sort(byOccurred);
  for (const e of ordered) {
    const on = localDate(e.occurredAt, tz);
    if (e.type === "SALE") {
      const creditKobo = e.totalKobo - e.paidNowKobo;
      if (creditKobo <= 0 || !e.customerId) continue;
      const dueDate = e.promisedDate ?? addDays(on, settings.defaultDueDays);
      // The pay-by date given at sale time is the due date, not a promise record: lateness on it is
      // already measured by the on-time rate, and counting it twice would contradict "Good payer".
      const debt: Debt = { saleId: e.id, customerId: e.customerId, saleDate: on, creditKobo, paidKobo: 0, openKobo: creditKobo, dueDate };
      debts.set(e.id, debt);
      // Credit held from an earlier overpayment is used up against the new debt straight away.
      const held = credit.get(e.customerId) ?? 0;
      if (held > 0) {
        const amount = Math.min(held, debt.openKobo);
        pay(debt, amount, on);
        credit.set(e.customerId, held - amount);
      }
    } else if (e.type === "PROMISE") {
      // A promise for one sale moves that debt's due date; otherwise it covers all the customer's open debts.
      const covered = e.saleId
        ? [debts.get(e.saleId)].filter((d): d is Debt => !!d && d.customerId === e.customerId && d.openKobo > 0)
        : openDebtsOf(e.customerId);
      for (const d of covered) d.dueDate = e.promisedDate;
      addPromise(e.customerId, covered.map((d) => d.saleId), e.promisedDate, on);
    } else if (e.type === "PAYMENT") {
      let remaining = e.amountKobo;
      const used: { saleId: string; amountKobo: number }[] = [];
      for (const a of e.allocations) {
        const d = debts.get(a.saleId);
        if (!d || d.customerId !== e.customerId || d.openKobo === 0) continue;
        const amount = Math.min(a.amountKobo, d.openKobo, remaining);
        if (amount <= 0) continue;
        pay(d, amount, on);
        used.push({ saleId: d.saleId, amountKobo: amount });
        remaining -= amount;
      }
      for (const d of openDebtsOf(e.customerId).sort(oldestFirst)) {
        if (remaining === 0) break;
        const amount = Math.min(d.openKobo, remaining);
        pay(d, amount, on);
        used.push({ saleId: d.saleId, amountKobo: amount });
        remaining -= amount;
      }
      if (remaining > 0) credit.set(e.customerId, (credit.get(e.customerId) ?? 0) + remaining);
      applied.set(e.id, used);
    }
  }

  for (const p of promises) {
    p.kept = p.saleIds.every((id) => {
      const d = debts.get(id);
      return !!d && d.settledDate !== undefined && d.settledDate <= p.promisedDate;
    });
  }

  const balances = new Map<string, CustomerBalance>();
  const balanceOf = (customerId: string) => {
    let b = balances.get(customerId);
    if (!b) balances.set(customerId, (b = { customerId, owedKobo: 0, creditKobo: 0, overdueKobo: 0 }));
    return b;
  };
  for (const d of debts.values()) {
    const b = balanceOf(d.customerId);
    b.owedKobo += d.openKobo;
    if (d.openKobo > 0 && d.dueDate < asOf) b.overdueKobo += d.openKobo;
  }
  for (const [customerId, kobo] of credit) balanceOf(customerId).creditKobo += kobo;

  return {
    asOf,
    debts: [...debts.values()].sort(oldestFirst),
    promises,
    balances,
    appliedAllocations: applied,
  };
}

function oldestFirst(a: Debt, b: Debt): number {
  return a.saleDate < b.saleDate ? -1 : a.saleDate > b.saleDate ? 1 : a.saleId < b.saleId ? -1 : 1;
}

/**
 * The allocations to store on a new payment: the chosen debt first if given, then oldest-first.
 * Anything left over is not allocated and becomes customer credit.
 */
export function proposeAllocations(
  state: DebtState,
  customerId: string,
  amountKobo: number,
  chosenSaleId?: string,
): { saleId: string; amountKobo: number }[] {
  const open = state.debts.filter((d) => d.customerId === customerId && d.openKobo > 0);
  const chosen = open.find((d) => d.saleId === chosenSaleId);
  const order = chosen ? [chosen, ...open.filter((d) => d !== chosen)] : open;
  const out: { saleId: string; amountKobo: number }[] = [];
  let remaining = amountKobo;
  for (const d of order) {
    if (remaining === 0) break;
    const amount = Math.min(d.openKobo, remaining);
    out.push({ saleId: d.saleId, amountKobo: amount });
    remaining -= amount;
  }
  return out;
}
