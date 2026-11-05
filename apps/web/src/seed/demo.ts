import { addDays, validateEntry, type Entry, type ShopSettings } from "@trustbook/ledger";
import { ulid } from "ulid";

/** Seeded PRNG so the demo shop is the same on every run for a given end date. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_SHOP_ID = "demo-mama-ngozi";
export const DEMO_SHOP = {
  id: DEMO_SHOP_ID,
  name: "Mama Ngozi Provisions",
  ownerName: "Ngozi",
  currency: "NGN",
  timezone: "Africa/Lagos",
  openingCashKobo: 30_000_000, // ₦300,000
  defaultDueDays: 14,
  mode: "DEMO" as const,
};

const naira = (n: number) => n * 100;
export const DEMO_ITEMS = [
  { id: "rice-50kg", name: "Rice (50kg bag)", unit: "bag", costKobo: naira(78_000), priceKobo: naira(85_000) },
  { id: "beans-paint", name: "Beans (paint)", unit: "paint", costKobo: naira(2_500), priceKobo: naira(3_000) },
  { id: "garri-paint", name: "Garri (paint)", unit: "paint", costKobo: naira(1_500), priceKobo: naira(1_800) },
  { id: "palm-oil-4l", name: "Palm oil (4 litres)", unit: "keg", costKobo: naira(9_000), priceKobo: naira(10_500) },
  { id: "eggs-crate", name: "Eggs (crate)", unit: "crate", costKobo: naira(3_800), priceKobo: naira(4_500) },
  { id: "sugar-pack", name: "Sugar (pack)", unit: "pack", costKobo: naira(1_200), priceKobo: naira(1_500) },
  { id: "milk-tin", name: "Peak milk (tin)", unit: "tin", costKobo: naira(400), priceKobo: naira(500) },
  { id: "indomie-carton", name: "Indomie (carton)", unit: "carton", costKobo: naira(9_500), priceKobo: naira(11_000) },
];

/**
 * Credit habits. `every`: days between credit sales. `promiseIn`: days to the promised date.
 * `delays`: days after the promise each debt is paid, cycling (negative = early; null = not paid).
 */
const HABITS = [
  { id: "cust-amaka", name: "Amaka", phone: "2348030000001", start: 1, every: 5, promiseIn: 5, delays: [0, -1, 0, -2, 0], note: "Good payer" },
  { id: "cust-bisi", name: "Bisi", phone: "2348030000002", start: 2, every: 6, promiseIn: 4, delays: [0, 0, 1, 0, -1], note: "Good payer" },
  { id: "cust-chinedu", name: "Chinedu", phone: "2348030000003", start: 3, every: 6, promiseIn: 5, delays: [0, 5, 0, 0, 6, 0], note: "Sometimes late" },
  { id: "cust-sola", name: "Sola", phone: "2348030000004", start: 4, every: 7, promiseIn: 7, delays: [0, 3, 0, 0, 4], note: "Sometimes late" },
  { id: "cust-tunde", name: "Tunde", phone: "2348030000005", start: 1, every: 6, promiseIn: 5, delays: [null, 9, 12, 8, null, 10], note: "Careful" },
  { id: "cust-emeka", name: "Emeka", phone: "2348030000006", start: 30, every: 8, promiseIn: 7, delays: [0], note: "New" },
  { id: "cust-halima", name: "Halima", phone: "2348030000007", start: 5, every: 9, promiseIn: 6, delays: [0, -1, 0, 0], note: "Good payer, overpaid once" },
  { id: "cust-uche", name: "Uche", phone: "2348030000008", start: 0, every: 0, promiseIn: 0, delays: [], note: "Cash only" },
] as const;
export const DEMO_CUSTOMERS = HABITS.map(({ id, name, phone }) => ({ id, name, phone }));

/**
 * Builds ~6 weeks of entries ending on `lastDay` (a Lagos date). Seeded entries are recorded at
 * their business time so each lands in its own day's record; the shop's DEMO mode is what labels
 * them as demo data. Every entry passes the ledger's validation.
 */
export function buildDemoEntries(lastDay: string, days = 42): Entry[] {
  const rand = mulberry32(20261103);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const firstDay = addDays(lastDay, -(days - 1));
  const out: Entry[] = [];
  const time = (date: string, hour: number, minute = 0) =>
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+01:00`;
  const push = (date: string, hour: number, body: Record<string, unknown>) => {
    const at = time(date, hour, Math.floor(rand() * 60));
    const e = validateEntry({
      id: ulid(Date.parse(at), rand),
      shopId: DEMO_SHOP_ID,
      occurredAt: at,
      recordedAt: at,
      source: "manual",
      confirmedBy: "owner",
      ...body,
    });
    out.push(e);
    return e;
  };
  const line = (item: (typeof DEMO_ITEMS)[number], qty: number) => ({ itemId: item.id, qty, unitPriceKobo: item.priceKobo });
  const total = (lines: { qty: number; unitPriceKobo: number }[]) => lines.reduce((s, l) => s + l.qty * l.unitPriceKobo, 0);

  for (let i = 0; i < days; i++) {
    const date = addDays(firstDay, i);
    if (i % 8 === 2) {
      const lines = [line(DEMO_ITEMS[0]!, 1)];
      push(date, 11, { type: "SALE", items: lines, totalKobo: total(lines), paidNowKobo: total(lines) });
    }
    // Cash sales through the day, including Uche, the cash-only customer.
    const cashSales = 3 + Math.floor(rand() * 4);
    for (let s = 0; s < cashSales; s++) {
      const lines = [line(pick(DEMO_ITEMS.slice(1)), 1 + Math.floor(rand() * 3))];
      const t = total(lines);
      push(date, 9 + s, { type: "SALE", items: lines, totalKobo: t, paidNowKobo: t, ...(s === 0 && i % 3 === 0 ? { customerId: "cust-uche" } : {}) });
    }
    if (i % 2 === 0) push(date, 18, { type: "EXPENSE", category: "transport", amountKobo: naira(1_500), note: "Market transport" });
    if (i === 14 || i === 35) push(date, 18, { type: "EXPENSE", category: "levy", amountKobo: naira(2_000), note: "Market levy" });
  }

  // Credit sales and their repayments, per customer habit.
  for (const h of HABITS) {
    if (!h.every) continue;
    let n = 0;
    for (let day = h.start; day < days; day += h.every, n++) {
      const date = addDays(firstDay, day);
      const lines = [line(pick(DEMO_ITEMS.slice(1)), 2 + Math.floor(rand() * 3))];
      const t = total(lines);
      const paidNow = n % 3 === 1 ? Math.floor(t / 4 / 100) * 100 : 0;
      const promised = addDays(date, h.promiseIn);
      const sale = push(date, 12, { type: "SALE", items: lines, totalKobo: t, paidNowKobo: paidNow, customerId: h.id, promisedDate: promised });
      const delay = h.delays[n % h.delays.length];
      const owed = t - paidNow;
      if (h.id === "cust-tunde" && delay !== null && delay !== undefined) {
        // Tunde asks for more time before paying late, then misses that date too.
        push(addDays(promised, 1), 16, { type: "PROMISE", customerId: h.id, saleId: sale.id, promisedDate: addDays(promised, 4) });
      }
      if (delay === null || delay === undefined) continue;
      const payDay = addDays(promised, delay);
      if (payDay > lastDay) continue;
      const extra = h.id === "cust-halima" && n === 1 ? naira(2_000) : 0; // one overpayment, kept as credit
      push(payDay, 15, { type: "PAYMENT", customerId: h.id, amountKobo: owed + extra, method: n % 2 ? "transfer" : "cash", allocations: [{ saleId: sale.id, amountKobo: owed }] });
    }
  }

  // Restock every 4 days at 07:00, buying what sells over the next 4 days plus a small buffer on the
  // first delivery, so stock never goes negative. One delivery from Alhaji is part-paid, leaving a
  // supplier balance.
  for (let i = 0; i < days; i += 4) {
    const from = addDays(firstDay, i);
    const to = addDays(firstDay, i + 3);
    const sold = new Map<string, number>();
    for (const e of out) {
      const d = e.occurredAt.slice(0, 10);
      if (e.type !== "SALE" || d < from || d > to) continue;
      for (const l of e.items) sold.set(l.itemId, (sold.get(l.itemId) ?? 0) + l.qty);
    }
    const items = DEMO_ITEMS.map((it) => ({ itemId: it.id, qty: (sold.get(it.id) ?? 0) + (i === 0 ? 2 : 0), unitCostKobo: it.costKobo })).filter((l) => l.qty > 0);
    const t = items.reduce((s, l) => s + l.qty * l.unitCostKobo, 0);
    push(from, 7, { type: "PURCHASE", items, totalKobo: t, supplier: "Alhaji Musa", paidNowKobo: i === 20 ? t - naira(50_000) : t });
  }
  return out.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || (a.id < b.id ? -1 : 1));
}

export const demoSettings: ShopSettings = {
  shopId: DEMO_SHOP_ID,
  timezone: DEMO_SHOP.timezone,
  openingCashKobo: DEMO_SHOP.openingCashKobo,
  defaultDueDays: DEMO_SHOP.defaultDueDays,
};
