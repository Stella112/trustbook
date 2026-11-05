import { addDays, daysBetween } from "./dates.js";
import type { Debt, DebtState } from "./debts.js";

export type TrustLabel = "New" | "Good payer" | "Sometimes late" | "Careful";

export interface TrustResult {
  customerId: string;
  label: TrustLabel;
  /** Plain-words reasons, e.g. "Paid 4 of 6 on time · usually 9 days late · 1 promise broken". */
  evidence: string;
  onTime: number;
  considered: number;
  brokenPromises60d: number;
  maxOverdueDays: number;
  /** Only for Careful and Sometimes late: the median fully-repaid credit amount, if any. */
  suggestedLimitKobo: number | null;
  overridden: boolean;
}

/**
 * Labels a customer from their credit history, following the brief's rules in its listed order.
 * Considered debts are those fully paid, or unpaid past their due date.
 */
export function trustLabel(state: DebtState, customerId: string, override?: TrustLabel): TrustResult {
  const asOf = state.asOf;
  const mine = state.debts.filter((d) => d.customerId === customerId);
  const considered = mine.filter((d) => d.settledDate !== undefined || d.dueDate < asOf);
  const lateness = considered.map((d) => Math.max(0, daysBetween(d.dueDate, d.settledDate ?? asOf)));
  const onTime = considered.filter((d) => d.settledDate !== undefined && d.settledDate <= d.dueDate).length;
  const maxOverdueDays = Math.max(0, ...mine.filter((d) => d.openKobo > 0 && d.dueDate < asOf).map((d) => daysBetween(d.dueDate, asOf)));
  const since = addDays(asOf, -60);
  const brokenPromises60d = state.promises.filter(
    (p) => p.customerId === customerId && !p.kept && p.promisedDate < asOf && p.promisedDate >= since,
  ).length;
  const n = considered.length;

  let label: TrustLabel;
  if (n < 3) label = "New";
  else if (onTime * 100 < 50 * n || maxOverdueDays > 30 || brokenPromises60d >= 2) label = "Careful";
  else if (onTime * 100 >= 80 * n && lateness.reduce((s, x) => s + x, 0) <= 2 * n) label = "Good payer";
  else label = "Sometimes late";

  const lateDays = lateness.filter((x) => x > 0);
  const parts = [n === 0 ? "No credit due yet" : `Paid ${onTime} of ${n} on time`];
  if (lateDays.length) {
    const days = median(lateDays);
    parts.push(`usually ${days} day${days === 1 ? "" : "s"} late`);
  }
  if (brokenPromises60d) parts.push(`${brokenPromises60d} promise${brokenPromises60d > 1 ? "s" : ""} broken`);
  if (maxOverdueDays > 0) parts.push(`oldest unpaid debt ${maxOverdueDays} day${maxOverdueDays === 1 ? "" : "s"} overdue`);

  const finalLabel = override ?? label;
  return {
    customerId,
    label: finalLabel,
    evidence: parts.join(" · "),
    onTime,
    considered: n,
    brokenPromises60d,
    maxOverdueDays,
    suggestedLimitKobo: finalLabel === "Careful" || finalLabel === "Sometimes late" ? medianRepaid(mine) : null,
    overridden: override !== undefined,
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  // Lower median for even counts keeps whole numbers and stays conservative.
  return s.length % 2 ? s[mid]! : s[mid - 1]!;
}

function medianRepaid(debts: Debt[]): number | null {
  const repaid = debts.filter((d) => d.settledDate !== undefined).map((d) => d.creditKobo);
  return repaid.length ? median(repaid) : null;
}
