import { describe, expect, it } from "vitest";
import { capitalReport, positionAt, productProfit, type Entry } from "../src/index";
import { at, expense, purchase, sale, settings, SHOP } from "./fixtures";

const ownerOut = (date: string, amountKobo: number): Entry => ({ id: `out-${date}`, shopId: SHOP, occurredAt: at(date, 18), recordedAt: at(date, 18), source: "manual", confirmedBy: "owner", type: "OWNER_OUT", amountKobo, note: "" });

describe("capital and profit", () => {
  // Opening cash ₦10,000 (fixtures). Buy 10 rice at ₦500 each, ₦2,000 of it on credit from the supplier.
  const buy = purchase("2026-11-01", [{ itemId: "rice", qty: 10, unitCostKobo: 50_000 }], 300_000);
  const cashSale = sale("2026-11-02", { items: [{ itemId: "rice", qty: 4, unitPriceKobo: 80_000 }] }); // ₦3,200 cash
  const creditSale = sale("2026-11-03", { items: [{ itemId: "rice", qty: 2, unitPriceKobo: 80_000 }], paid: 0, customerId: "c1" }); // ₦1,600 credit
  const rent = expense("2026-11-04", 50_000);
  const entries = [buy, cashSale, creditSale, rent];

  it("counts only cash as recovered, and restock money net of supplier debt", () => {
    const r = capitalReport(entries, settings, "2026-11-07");
    // Cash: 10,000 − 3,000 paid for stock + 3,200 cash sale − 500 rent = 9,700.
    expect(r.cashInHandKobo).toBe(970_000);
    expect(r.capitalInKobo).toBe(1_000_000);
    expect(r.recoveredKobo).toBe(970_000);
    expect(r.toRecoverKobo).toBe(30_000);
    expect(r.receivablesKobo).toBe(160_000); // the credit sale is owed, not recovered
    expect(r.supplierOwedKobo).toBe(200_000);
    expect(r.safeToRestockKobo).toBe(770_000); // 9,700 − 2,000 owed to the supplier, counted once
    // Revenue 4,800; cost of 6 rice at ₦500 = 3,000; gross 1,800; net 1,300 after rent.
    expect(r).toMatchObject({ revenueKobo: 480_000, cogsKobo: 300_000, grossProfitKobo: 180_000, netProfitKobo: 130_000 });
    const pos = positionAt(entries, settings, "2026-11-07");
    expect(r.cashInHandKobo).toBe(pos.cashOnHandKobo + pos.suiWalletKobo);
    expect(r.stockValueKobo).toBe(pos.stockValueKobo); // 4 rice left at ₦500
  });

  it("never shows profit when a sold item has no cost price", () => {
    const r = capitalReport([sale("2026-11-02", { items: [{ itemId: "soap", qty: 1, unitPriceKobo: 10_000 }] })], settings, "2026-11-07");
    expect(r).toMatchObject({ cogsKobo: null, grossProfitKobo: null, netProfitKobo: null, itemsWithoutCost: ["soap"] });
  });

  it("lowers capital when the owner takes money out, and never reports negative restock money", () => {
    const r = capitalReport([...entries, ownerOut("2026-11-05", 900_000)], settings, "2026-11-07");
    expect(r.capitalInKobo).toBe(100_000);
    expect(r.cashInHandKobo).toBe(70_000);
    expect(r.safeToRestockKobo).toBe(0);
  });

  it("reports profit per product from the same costs", () => {
    const [rice] = productProfit(entries, settings, "2026-11-01", "2026-11-30");
    expect(rice).toMatchObject({ itemId: "rice", qtyMilli: 6_000, revenueKobo: 480_000, cogsKobo: 300_000, grossProfitKobo: 180_000 });
  });
});
