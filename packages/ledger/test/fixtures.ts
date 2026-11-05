import type { Entry, ShopSettings } from "../src/index.js";

export const SHOP = "shop1";
export const settings: ShopSettings = { shopId: SHOP, timezone: "Africa/Lagos", openingCashKobo: 1_000_000, defaultDueDays: 14 };

let n = 0;
/** A Lagos-time instant (UTC+1) for a date and hour. */
export const at = (date: string, hour = 10) => `${date}T${String(hour).padStart(2, "0")}:00:00+01:00`;
const base = (date: string, hour = 10) => ({
  id: `e${String(++n).padStart(4, "0")}`,
  shopId: SHOP,
  occurredAt: at(date, hour),
  recordedAt: at(date, hour),
  source: "manual" as const,
  confirmedBy: "owner",
});

export function sale(date: string, opts: { items?: { itemId: string; qty: number; unitPriceKobo: number }[]; paid?: number; customerId?: string; promisedDate?: string; hour?: number } = {}): Entry {
  const items = opts.items ?? [{ itemId: "rice", qty: 1, unitPriceKobo: 100_000 }];
  const total = items.reduce((s, i) => s + Math.round(i.qty * 1000 * i.unitPriceKobo / 1000), 0);
  return { ...base(date, opts.hour), type: "SALE", items, totalKobo: total, paidNowKobo: opts.paid ?? total, customerId: opts.customerId, promisedDate: opts.promisedDate };
}
export function payment(date: string, customerId: string, amountKobo: number, allocations: { saleId: string; amountKobo: number }[] = [], hour?: number): Entry {
  return { ...base(date, hour), type: "PAYMENT", customerId, amountKobo, method: "cash", allocations };
}
export function purchase(date: string, items: { itemId: string; qty: number; unitCostKobo: number }[], paid?: number, hour?: number): Entry {
  const total = items.reduce((s, i) => s + Math.round(i.qty * i.unitCostKobo), 0);
  return { ...base(date, hour), type: "PURCHASE", items, totalKobo: total, paidNowKobo: paid ?? total };
}
export function expense(date: string, amountKobo: number): Entry {
  return { ...base(date), type: "EXPENSE", category: "transport", amountKobo, note: "" };
}
export function ownerIn(date: string, amountKobo: number): Entry {
  return { ...base(date), type: "OWNER_IN", amountKobo, note: "" };
}
export function stockAdjust(date: string, itemId: string, qtyDelta: number): Entry {
  return { ...base(date), type: "STOCK_ADJUST", itemId, qtyDelta, reason: "count" };
}
export function promise(date: string, customerId: string, promisedDate: string, saleId?: string): Entry {
  return { ...base(date), type: "PROMISE", customerId, promisedDate, saleId };
}
export function correction(date: string, target: Entry, replacement?: Entry): Entry {
  return { ...base(date), type: "CORRECTION", targetEntryId: target.id, reason: "mistake", replacement: replacement as never };
}
