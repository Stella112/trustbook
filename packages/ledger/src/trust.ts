import { addDays, daysBetween } from "./dates";
import type { Debt, DebtState } from "./debts";

/** The five ratings (approved 7 Nov). */
export const TRUST_LABELS = ["Excellent payer", "Reliable payer", "Sometimes late", "High risk", "Insufficient history"] as const;
export type TrustLabel = (typeof TRUST_LABELS)[number];

/** Old names (before 7 Nov) still saved in owner overrides and Walrus memories. */
const OLD_NAMES: Record<string, TrustLabel> = { New: "Insufficient history", "Good payer": "Reliable payer", Careful: "High risk" };

/** Reads a saved label, old or new name; unknown text gives undefined (no override). */
export function normalizeLabel(raw: string | null | undefined): TrustLabel | undefined {
  if (!raw) return undefined;
  if ((TRUST_LABELS as readonly string[]).includes(raw)) return raw as TrustLabel;
  return OLD_NAMES[raw];
}

export interface TrustResult {
  customerId: string;
  label: TrustLabel;
  /** Plain-words reasons, e.g. "Paid 4 of 6 on time · usually 9 days late · 1 promise broken". */
  evidence: string;
  onTime: number;
  considered: number;
  brokenPromises60d: number;
  maxOverdueDays: number;
  /** Only for High risk and Sometimes late: the median fully-repaid credit amount, if any. */
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

  // Approved 6 Nov: the hard warning signs (30+ days overdue, 2 broken promises) apply even to a new
  // customer; the on-time rate only counts once there are 3 debts to judge.
  // Five ratings (approved 7 Nov). A strong rating needs history: Excellent needs 5+ debts, all on
  // time, nothing overdue now; fewer than 3 debts is "Insufficient history" unless a hard warning sign.
  let label: TrustLabel;
  if (maxOverdueDays > 30 || brokenPromises60d >= 2) label = "High risk";
  else if (n < 3) label = "Insufficient history";
  else if (onTime * 100 < 50 * n) label = "High risk";
  else if (n >= 5 && onTime === n && maxOverdueDays === 0) label = "Excellent payer";
  else if (onTime * 100 >= 80 * n && lateness.reduce((s, x) => s + x, 0) <= 2 * n) label = "Reliable payer";
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
    suggestedLimitKobo: finalLabel === "High risk" || finalLabel === "Sometimes late" ? medianRepaid(mine) : null,
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

export interface CreditLimitCheck {
  /** The limit used: the owner's own, else Trustbook's suggestion, else none. */
  limitKobo: number | null;
  source: "owner" | "suggested" | null;
  /** What the customer would owe after this credit. */
  afterKobo: number;
  over: boolean;
}

/**
 * Checks new credit against a customer's limit. A warning only: the owner always decides. The
 * owner's limit wins; without one, Trustbook's cautious suggestion is used if there is one.
 */
export function creditLimitCheck(owedKobo: number, newCreditKobo: number, ownerLimitKobo: number | null | undefined, suggestedKobo: number | null): CreditLimitCheck {
  const afterKobo = owedKobo + newCreditKobo;
  const limitKobo = ownerLimitKobo ?? suggestedKobo;
  const source = ownerLimitKobo != null ? "owner" : suggestedKobo != null ? "suggested" : null;
  return { limitKobo: limitKobo ?? null, source, afterKobo, over: limitKobo != null && afterKobo > limitKobo };
}
