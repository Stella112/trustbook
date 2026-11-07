import { describe, expect, it } from "vitest";
import { positionAt, supplierAccounts, supplierSummary, type Entry } from "../src/index";
import { at, purchase, settings, SHOP } from "./fixtures";

let n = 0;
const supplierPay = (date: string, supplier: string, amountKobo: number): Entry => ({
  id: `sp${++n}`,
  shopId: SHOP,
  occurredAt: at(date, 15),
  recordedAt: at(date, 15),
  source: "manual",
  confirmedBy: "owner",
  type: "SUPPLIER_PAYMENT",
  supplier,
  amountKobo,
  note: "",
});
const bought = (date: string, supplier: string, totalKobo: number, paid: number, dueDate?: string): Entry => ({
  ...(purchase(date, [{ itemId: "rice", qty: 1, unitCostKobo: totalKobo }], paid) as Extract<Entry, { type: "PURCHASE" }>),
  supplier,
  ...(dueDate ? { dueDate } : {}),
});

describe("supplier accounts", () => {
  it("tracks bills, pays them oldest first, and matches the shop's supplier balance", () => {
    const entries = [
      bought("2026-11-01", "Alhaji", 100_000, 20_000, "2026-11-05"),
      bought("2026-11-03", "alhaji ", 50_000, 0, "2026-11-20"),
      supplierPay("2026-11-04", "Alhaji", 90_000),
      bought("2026-11-02", "Dangote depot", 200_000, 200_000),
    ];
    const [alhaji, depot] = supplierAccounts(entries, settings, "2026-11-07");
    expect(alhaji).toMatchObject({ name: "Alhaji", purchasesKobo: 150_000, paidKobo: 110_000, owedKobo: 40_000, creditKobo: 0 });
    // 90k pays the first bill's 80k, then 10k of the second.
    expect(alhaji!.bills.map((b) => b.openKobo)).toEqual([0, 40_000]);
    expect(alhaji!.overdueKobo).toBe(0);
    expect(alhaji!.nextDueDate).toBe("2026-11-20");
    expect(depot).toMatchObject({ owedKobo: 0, purchasesKobo: 200_000 });
    expect(alhaji!.owedKobo + depot!.owedKobo).toBe(positionAt(entries, settings, "2026-11-07").supplierOwedKobo);
  });

  it("marks overdue and due-soon bills", () => {
    const entries = [bought("2026-10-20", "Alhaji", 60_000, 0, "2026-11-01"), bought("2026-11-06", "Iya Bose", 30_000, 10_000, "2026-11-10")];
    const accounts = supplierAccounts(entries, settings, "2026-11-07");
    const s = supplierSummary(accounts, "2026-11-07");
    expect(s).toMatchObject({ owedKobo: 80_000, suppliersOwed: 2, overdueKobo: 60_000 });
    expect(s.dueSoon.map((b) => b.supplier)).toEqual(["Iya Bose"]);
    expect(s.overdue.map((b) => b.supplier)).toEqual(["Alhaji"]);
  });

  it("keeps an overpayment as credit and uses it on the next bill, never losing it", () => {
    const entries = [bought("2026-11-01", "Alhaji", 50_000, 0), supplierPay("2026-11-02", "Alhaji", 70_000), bought("2026-11-03", "Alhaji", 30_000, 0)];
    const [a] = supplierAccounts(entries, settings, "2026-11-07");
    expect(a).toMatchObject({ owedKobo: 10_000, creditKobo: 0, paidKobo: 70_000 });
  });

  it("ignores a purchase reversed by a correction", () => {
    const p = bought("2026-11-01", "Alhaji", 50_000, 0);
    const fix: Entry = { id: "fix1", shopId: SHOP, occurredAt: at("2026-11-02"), recordedAt: at("2026-11-02"), source: "manual", confirmedBy: "owner", type: "CORRECTION", targetEntryId: p.id, reason: "wrong" };
    expect(supplierAccounts([p, fix], settings, "2026-11-07")).toEqual([]);
  });
});
