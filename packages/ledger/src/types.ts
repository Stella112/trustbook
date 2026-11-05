import { z } from "zod";

/** Money is always an integer count of minor units (kobo, or USDC micro-units). Never a float. */
export const Minor = z.number().int().nonnegative().refine(Number.isSafeInteger, "amount too large");
/** A local calendar date, "YYYY-MM-DD", in the shop's timezone. */
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** An instant with an explicit offset, e.g. "2026-11-05T14:30:00+01:00". */
export const Instant = z.iso.datetime({ offset: true });
/** Quantities may be fractional (1.5 kg) but are limited to 3 decimal places so money stays exact. */
const Qty = z.number().positive().refine((n) => Number.isSafeInteger(Math.round(n * 1000)) && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, "qty allows at most 3 decimals");

const base = {
  id: z.string().min(1),
  shopId: z.string().min(1),
  occurredAt: Instant,
  recordedAt: Instant,
  source: z.enum(["text", "voice", "manual", "payment", "recovery"]),
  confirmedBy: z.string().min(1),
};

export const SaleEntry = z.object({
  ...base,
  type: z.literal("SALE"),
  items: z.array(z.object({ itemId: z.string().min(1), qty: Qty, unitPriceKobo: Minor })).min(1),
  totalKobo: Minor,
  paidNowKobo: Minor,
  customerId: z.string().min(1).optional(),
  promisedDate: LocalDate.optional(),
});

export const PaymentEntry = z.object({
  ...base,
  type: z.literal("PAYMENT"),
  customerId: z.string().min(1),
  amountKobo: Minor.refine((n) => n > 0, "payment must be positive"),
  method: z.enum(["sui", "cash", "transfer"]),
  allocations: z.array(z.object({ saleId: z.string().min(1), amountKobo: Minor })),
  verification: z
    .object({ digest: z.string().min(1), coinType: z.string().min(1), amountMinor: Minor, rateUsed: z.string().min(1) })
    .optional(),
});

export const PurchaseEntry = z.object({
  ...base,
  type: z.literal("PURCHASE"),
  items: z.array(z.object({ itemId: z.string().min(1), qty: Qty, unitCostKobo: Minor })).min(1),
  totalKobo: Minor,
  supplier: z.string().min(1).optional(),
  paidNowKobo: Minor,
});

export const ExpenseEntry = z.object({
  ...base,
  type: z.literal("EXPENSE"),
  category: z.string().min(1),
  amountKobo: Minor,
  note: z.string(),
});

export const OwnerInEntry = z.object({ ...base, type: z.literal("OWNER_IN"), amountKobo: Minor, note: z.string() });
export const OwnerOutEntry = z.object({ ...base, type: z.literal("OWNER_OUT"), amountKobo: Minor, note: z.string() });

export const StockAdjustEntry = z.object({
  ...base,
  type: z.literal("STOCK_ADJUST"),
  itemId: z.string().min(1),
  qtyDelta: z.number().refine((n) => n !== 0, "qtyDelta cannot be 0"),
  reason: z.string().min(1),
});

export const PromiseEntry = z.object({
  ...base,
  type: z.literal("PROMISE"),
  customerId: z.string().min(1),
  saleId: z.string().min(1).optional(),
  promisedDate: LocalDate,
});

/** Every entry a correction may put back in place of the one it reverses. */
export const ReplaceableEntry = z.discriminatedUnion("type", [
  SaleEntry,
  PaymentEntry,
  PurchaseEntry,
  ExpenseEntry,
  OwnerInEntry,
  OwnerOutEntry,
  StockAdjustEntry,
  PromiseEntry,
]);

export const CorrectionEntry = z.object({
  ...base,
  type: z.literal("CORRECTION"),
  targetEntryId: z.string().min(1),
  reason: z.string().min(1),
  replacement: ReplaceableEntry.optional(),
});

export const Entry = z.discriminatedUnion("type", [...ReplaceableEntry.options, CorrectionEntry]);

export type Entry = z.infer<typeof Entry>;
export type ReplaceableEntry = z.infer<typeof ReplaceableEntry>;
export type SaleEntry = z.infer<typeof SaleEntry>;
export type PaymentEntry = z.infer<typeof PaymentEntry>;
export type PurchaseEntry = z.infer<typeof PurchaseEntry>;
export type ExpenseEntry = z.infer<typeof ExpenseEntry>;
export type StockAdjustEntry = z.infer<typeof StockAdjustEntry>;
export type PromiseEntry = z.infer<typeof PromiseEntry>;
export type CorrectionEntry = z.infer<typeof CorrectionEntry>;

export interface ShopSettings {
  shopId: string;
  timezone: string; // IANA, default "Africa/Lagos"
  openingCashKobo: number;
  /** Days after a sale before an unpromised debt counts as overdue. */
  defaultDueDays: number;
}

export const DEFAULT_TIMEZONE = "Africa/Lagos";
export const DEFAULT_DUE_DAYS = 14;

/**
 * Checks the rules zod cannot express alone: sale and purchase totals match their lines,
 * paid amounts never exceed totals, credit sales name a customer, and allocations never exceed a payment.
 */
export function validateEntry(raw: unknown): Entry {
  const e = Entry.parse(raw);
  checkRules(e);
  if (e.type === "CORRECTION" && e.replacement) checkRules(e.replacement);
  return e;
}

function checkRules(e: Entry): void {
  if (e.type === "SALE") {
    const lines = e.items.reduce((s, i) => s + lineTotal(i.qty, i.unitPriceKobo), 0);
    if (lines !== e.totalKobo) throw new Error(`SALE ${e.id}: totalKobo ${e.totalKobo} != lines ${lines}`);
    if (e.paidNowKobo > e.totalKobo) throw new Error(`SALE ${e.id}: paidNowKobo exceeds totalKobo`);
    if (e.paidNowKobo < e.totalKobo && !e.customerId) throw new Error(`SALE ${e.id}: credit sale needs a customer`);
  }
  if (e.type === "PURCHASE") {
    const lines = e.items.reduce((s, i) => s + lineTotal(i.qty, i.unitCostKobo), 0);
    if (lines !== e.totalKobo) throw new Error(`PURCHASE ${e.id}: totalKobo ${e.totalKobo} != lines ${lines}`);
    if (e.paidNowKobo > e.totalKobo) throw new Error(`PURCHASE ${e.id}: paidNowKobo exceeds totalKobo`);
  }
  if (e.type === "PAYMENT") {
    const allocated = e.allocations.reduce((s, a) => s + a.amountKobo, 0);
    if (allocated > e.amountKobo) throw new Error(`PAYMENT ${e.id}: allocations exceed amount`);
  }
}

/** qty × unit price in whole kobo. Uses integer thousandths of a unit, rounding half up, so no float touches money. */
export function lineTotal(qty: number, unitKobo: number): number {
  return mulDivRound(Math.round(qty * 1000), unitKobo, 1000);
}

/** round(a × b ÷ d), half up, computed exactly with bigint. All inputs are non-negative integers. */
export function mulDivRound(a: number, b: number, d: number): number {
  if (d <= 0) throw new Error("mulDivRound: divisor must be positive");
  const n = BigInt(a) * BigInt(b);
  const q = (n * 2n + BigInt(d)) / (BigInt(d) * 2n);
  const out = Number(q);
  if (!Number.isSafeInteger(out)) throw new Error("mulDivRound: result too large");
  return out;
}
