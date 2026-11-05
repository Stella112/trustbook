import { describe, expect, it } from "vitest";
import { computeDebts, effectiveEntries, lineTotal, type Entry, localDate, monthSummary, mulDivRound, positionAt, proposeAllocations, summarizePeriod, validateEntry } from "../src/index.js";
import { correction, expense, ownerIn, payment, promise, purchase, sale, settings, stockAdjust } from "./fixtures.js";

const debtsAt = (entries: Parameters<typeof effectiveEntries>[0], asOf: string) => computeDebts(effectiveEntries(entries), settings, asOf);

describe("money arithmetic", () => {
  it("multiplies fractional quantities without float error and rounds half up", () => {
    expect(lineTotal(1.5, 100_001)).toBe(150_002); // 150001.5 rounds up
    expect(lineTotal(0.1, 3)).toBe(0); // 0.3 kobo rounds down
    expect(lineTotal(2.345, 1000)).toBe(2345);
    expect(mulDivRound(1, 1, 2)).toBe(1);
    expect(mulDivRound(1, 1, 3)).toBe(0);
  });
});

describe("validation", () => {
  it("rejects a sale whose total does not match its lines", () => {
    const s = sale("2026-11-01");
    expect(() => validateEntry({ ...s, totalKobo: 1 })).toThrow(/totalKobo/);
  });
  it("rejects a credit sale with no customer", () => {
    expect(() => validateEntry(sale("2026-11-01", { paid: 0 }))).toThrow(/needs a customer/);
  });
  it("rejects allocations larger than the payment", () => {
    expect(() => validateEntry(payment("2026-11-01", "c1", 100, [{ saleId: "x", amountKobo: 200 }]))).toThrow(/exceed/);
  });
  it("rejects float money and more than 3 decimals of quantity", () => {
    expect(() => validateEntry({ ...sale("2026-11-01"), totalKobo: 100_000.5 })).toThrow();
    expect(() => validateEntry(sale("2026-11-01", { items: [{ itemId: "rice", qty: 1.0001, unitPriceKobo: 100 }] }))).toThrow();
  });
  it("accepts a valid entry", () => {
    expect(validateEntry(sale("2026-11-01")).type).toBe("SALE");
  });
});

describe("revenue and cash", () => {
  it("counts credit sales as revenue, and repayments as cash but never revenue", () => {
    const s = sale("2026-11-02", { paid: 30_000, customerId: "c1" });
    const before = summarizePeriod([s], settings, "2026-11-01", "2026-11-30");
    const after = summarizePeriod([s, payment("2026-11-05", "c1", 70_000)], settings, "2026-11-01", "2026-11-30");
    expect(before.revenueKobo).toBe(100_000);
    expect(after.revenueKobo).toBe(100_000);
    expect(before.cashCollectedKobo).toBe(30_000);
    expect(after.cashCollectedKobo).toBe(100_000);
  });
  it("puts a repayment's cash in the month it was paid, not the month of the sale", () => {
    const entries = [sale("2026-10-30", { paid: 0, customerId: "c1" }), payment("2026-11-03", "c1", 100_000)];
    expect(monthSummary(entries, settings, "2026-10").period).toMatchObject({ revenueKobo: 100_000, cashCollectedKobo: 0 });
    expect(monthSummary(entries, settings, "2026-11").period).toMatchObject({ revenueKobo: 0, cashCollectedKobo: 100_000 });
  });
});

describe("month boundaries in Africa/Lagos", () => {
  it("places 23:30 UTC on 31 Oct in November, because Lagos is UTC+1", () => {
    expect(localDate("2026-10-31T23:30:00Z", "Africa/Lagos")).toBe("2026-11-01");
    const s = { ...sale("2026-11-01"), occurredAt: "2026-10-31T23:30:00Z", recordedAt: "2026-10-31T23:30:00Z" };
    expect(monthSummary([s], settings, "2026-10").period.revenueKobo).toBe(0);
    expect(monthSummary([s], settings, "2026-11").period.revenueKobo).toBe(100_000);
  });
  it("keeps 23:59 Lagos time on 31 Oct in October", () => {
    const s = { ...sale("2026-10-31"), occurredAt: "2026-10-31T23:59:00+01:00" };
    expect(monthSummary([s], settings, "2026-10").period.revenueKobo).toBe(100_000);
  });
});

describe("cost of goods and profit", () => {
  it("uses the weighted average purchase cost up to the sale date", () => {
    const entries = [
      purchase("2026-11-01", [{ itemId: "rice", qty: 10, unitCostKobo: 50_000 }]),
      purchase("2026-11-02", [{ itemId: "rice", qty: 10, unitCostKobo: 70_000 }]),
      sale("2026-11-03", { items: [{ itemId: "rice", qty: 4, unitPriceKobo: 80_000 }] }),
      purchase("2026-11-04", [{ itemId: "rice", qty: 10, unitCostKobo: 200_000 }]),
      expense("2026-11-05", 10_000),
    ];
    const p = summarizePeriod(entries, settings, "2026-11-01", "2026-11-30");
    expect(p.cogsKobo).toBe(240_000); // 4 × 60,000; the later, dearer purchase is not used
    expect(p.grossProfitKobo).toBe(320_000 - 240_000);
    expect(p.netProfitKobo).toBe(320_000 - 240_000 - 10_000);
    expect(p.itemsWithoutCost).toEqual([]);
  });
  it("flags profit as unavailable when an item has no cost, and never invents one", () => {
    const entries = [
      purchase("2026-11-01", [{ itemId: "rice", qty: 10, unitCostKobo: 50_000 }]),
      sale("2026-11-02", { items: [{ itemId: "rice", qty: 1, unitPriceKobo: 80_000 }, { itemId: "oil", qty: 1, unitPriceKobo: 20_000 }, { itemId: "salt", qty: 1, unitPriceKobo: 5_000 }] }),
    ];
    const p = summarizePeriod(entries, settings, "2026-11-01", "2026-11-30");
    expect(p.cogsKobo).toBeNull();
    expect(p.grossProfitKobo).toBeNull();
    expect(p.netProfitKobo).toBeNull();
    expect(p.itemsWithoutCost).toEqual(["oil", "salt"]);
    expect(p.revenueKobo).toBe(105_000);
  });
  it("does not use a purchase made after the sale to cost it", () => {
    const entries = [sale("2026-11-01"), purchase("2026-11-02", [{ itemId: "rice", qty: 1, unitCostKobo: 1 }])];
    expect(summarizePeriod(entries, settings, "2026-11-01", "2026-11-30").itemsWithoutCost).toEqual(["rice"]);
  });
});

describe("debts and allocation", () => {
  const s1 = sale("2026-11-01", { paid: 0, customerId: "c1" }); // owes 100,000
  const s2 = sale("2026-11-03", { paid: 50_000, customerId: "c1", items: [{ itemId: "rice", qty: 2, unitPriceKobo: 100_000 }] }); // owes 150,000

  it("handles a partial payment", () => {
    const state = debtsAt([s1, payment("2026-11-02", "c1", 40_000)], "2026-11-05");
    expect(state.debts[0]).toMatchObject({ saleId: s1.id, openKobo: 60_000, paidKobo: 40_000 });
    expect(state.debts[0]!.settledDate).toBeUndefined();
    expect(state.balances.get("c1")).toMatchObject({ owedKobo: 60_000, creditKobo: 0 });
  });
  it("pays the oldest debt first when no debt is chosen", () => {
    const state = debtsAt([s1, s2, payment("2026-11-04", "c1", 120_000)], "2026-11-05");
    expect(state.debts.find((d) => d.saleId === s1.id)).toMatchObject({ openKobo: 0, settledDate: "2026-11-04" });
    expect(state.debts.find((d) => d.saleId === s2.id)).toMatchObject({ openKobo: 130_000 });
  });
  it("pays a chosen debt first", () => {
    const p = payment("2026-11-04", "c1", 120_000, [{ saleId: s2.id, amountKobo: 120_000 }]);
    const state = debtsAt([s1, s2, p], "2026-11-05");
    expect(state.debts.find((d) => d.saleId === s2.id)!.openKobo).toBe(30_000);
    expect(state.debts.find((d) => d.saleId === s1.id)!.openKobo).toBe(100_000);
  });
  it("keeps an overpayment as customer credit", () => {
    const state = debtsAt([s1, payment("2026-11-04", "c1", 130_000)], "2026-11-05");
    expect(state.balances.get("c1")).toMatchObject({ owedKobo: 0, creditKobo: 30_000 });
    expect(positionAt([s1, payment("2026-11-04", "c1", 130_000)], settings, "2026-11-05").customerCreditKobo).toBe(30_000);
  });
  it("proposes allocations: chosen debt, then oldest-first, leftover unallocated", () => {
    const state = debtsAt([s1, s2], "2026-11-05");
    expect(proposeAllocations(state, "c1", 300_000)).toEqual([
      { saleId: s1.id, amountKobo: 100_000 },
      { saleId: s2.id, amountKobo: 150_000 },
    ]);
    expect(proposeAllocations(state, "c1", 160_000, s2.id)).toEqual([
      { saleId: s2.id, amountKobo: 150_000 },
      { saleId: s1.id, amountKobo: 10_000 },
    ]);
  });
  it("marks debts overdue after the promised date, or 14 days by default", () => {
    const promised = sale("2026-11-01", { paid: 0, customerId: "c2", promisedDate: "2026-11-05" });
    expect(debtsAt([promised], "2026-11-05").balances.get("c2")!.overdueKobo).toBe(0);
    expect(debtsAt([promised], "2026-11-06").balances.get("c2")!.overdueKobo).toBe(100_000);
    expect(debtsAt([s1], "2026-11-15").balances.get("c1")!.overdueKobo).toBe(0);
    expect(debtsAt([s1], "2026-11-16").balances.get("c1")!.overdueKobo).toBe(100_000);
  });
  it("moves a due date when a new promise is made", () => {
    const state = debtsAt([s1, promise("2026-11-10", "c1", "2026-11-30", s1.id)], "2026-11-20");
    expect(state.debts[0]!.dueDate).toBe("2026-11-30");
    expect(state.balances.get("c1")!.overdueKobo).toBe(0);
  });
  it("ignores entries after the as-of date", () => {
    expect(debtsAt([s1, payment("2026-11-10", "c1", 100_000)], "2026-11-09").balances.get("c1")!.owedKobo).toBe(100_000);
  });
});

describe("corrections", () => {
  it("reverses an entry so it no longer counts", () => {
    const s = sale("2026-11-01");
    const entries = [s, correction("2026-11-02", s)];
    expect(summarizePeriod(entries, settings, "2026-11-01", "2026-11-30").revenueKobo).toBe(0);
  });
  it("counts a replacement in place of the original", () => {
    const s = sale("2026-11-01");
    const fixed = sale("2026-11-01", { items: [{ itemId: "rice", qty: 2, unitPriceKobo: 100_000 }] });
    expect(summarizePeriod([s, correction("2026-11-02", s, fixed)], settings, "2026-11-01", "2026-11-30").revenueKobo).toBe(200_000);
  });
  it("restores the original when the correction itself is reversed", () => {
    const s = sale("2026-11-01");
    const c = correction("2026-11-02", s);
    expect(summarizePeriod([s, c, correction("2026-11-03", c)], settings, "2026-11-01", "2026-11-30").revenueKobo).toBe(100_000);
  });
  it("re-applies a payment once the sale it named is reversed", () => {
    const a = sale("2026-11-01", { paid: 0, customerId: "c1" });
    const b = sale("2026-11-02", { paid: 0, customerId: "c1" });
    const p = payment("2026-11-03", "c1", 100_000, [{ saleId: a.id, amountKobo: 100_000 }]);
    const state = debtsAt([a, b, p, correction("2026-11-04", a)], "2026-11-05");
    expect(state.debts.map((d) => d.saleId)).toEqual([b.id]);
    expect(state.balances.get("c1")).toMatchObject({ owedKobo: 0, creditKobo: 0 });
  });
  it("rejects unknown targets and duplicate ids", () => {
    const s = sale("2026-11-01");
    expect(() => effectiveEntries([{ ...correction("2026-11-02", s), targetEntryId: "missing" } as Entry])).toThrow(/unknown entry/);
    expect(() => effectiveEntries([s, s])).toThrow(/duplicate/);
  });
});

describe("position", () => {
  it("computes cash on hand, stock value, receivables and net position", () => {
    const entries = [
      purchase("2026-11-01", [{ itemId: "rice", qty: 10, unitCostKobo: 50_000 }], 300_000), // owes supplier 200,000
      sale("2026-11-02", { items: [{ itemId: "rice", qty: 4, unitPriceKobo: 80_000 }], paid: 120_000, customerId: "c1" }),
      expense("2026-11-03", 10_000),
      ownerIn("2026-11-04", 50_000),
    ];
    const pos = positionAt(entries, settings, "2026-11-05");
    expect(pos.cashOnHandKobo).toBe(1_000_000 - 300_000 + 120_000 - 10_000 + 50_000);
    expect(pos.stockValueKobo).toBe(6 * 50_000);
    expect(pos.receivablesKobo).toBe(200_000);
    expect(pos.supplierOwedKobo).toBe(200_000);
    expect(pos.netPositionKobo).toBe(pos.cashOnHandKobo + 300_000 + 200_000 - 200_000);
  });
  it("warns about stock with no cost price and about negative stock", () => {
    const pos = positionAt(
      [sale("2026-11-01", { items: [{ itemId: "beans", qty: 2, unitPriceKobo: 1 }] }), stockAdjust("2026-11-01", "oil", 3)],
      settings,
      "2026-11-02",
    );
    expect(pos.stockWarnings).toEqual([
      { itemId: "beans", problem: "negative stock" },
      { itemId: "oil", problem: "no cost price" },
    ]);
  });
});
