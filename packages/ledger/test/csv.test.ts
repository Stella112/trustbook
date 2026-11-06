import { describe, expect, it } from "vitest";
import { koboToNairaText, ledgerCsv, type Entry } from "../src/index";

const base = (id: string, at: string) => ({ id, shopId: "s1", occurredAt: at, recordedAt: at, source: "manual" as const, confirmedBy: "owner" });
const names = { timezone: "Africa/Lagos", customerName: (id: string) => ({ c1: "Tunde, Jr." })[id] ?? id, itemName: (id: string) => ({ eggs: "Crate of eggs" })[id] ?? id };

describe("CSV export", () => {
  it("writes kobo as exact naira text", () => {
    expect(koboToNairaText(450050)).toBe("4500.50");
    expect(koboToNairaText(5)).toBe("0.05");
    expect(koboToNairaText(-100)).toBe("-1.00");
  });
  it("one row per entry, local time, quoting, and reversals kept", () => {
    const sale: Entry = { ...base("e1", "2026-11-03T22:30:00Z"), type: "SALE", items: [{ itemId: "eggs", qty: 2, unitPriceKobo: 450_000 }], totalKobo: 900_000, paidNowKobo: 300_000, customerId: "c1", promisedDate: "2026-11-07" };
    const fix: Entry = { ...base("e2", "2026-11-04T09:00:00Z"), type: "CORRECTION", targetEntryId: "e1", reason: "wrong price" };
    const csv = ledgerCsv([fix, sale], names);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("date,time,type,customer,amount_naira,paid_now_naira,on_credit_naira,method,details,verified_on_sui,entry_id,recorded_at,source,reversed_by");
    // 22:30 UTC on 3 Nov is 23:30 on 3 Nov in Lagos; recorded order puts the sale first.
    expect(lines[1]).toBe('2026-11-03,23:30,SALE,"Tunde, Jr.",9000.00,3000.00,6000.00,,2 x Crate of eggs @ 4500.00; promised by 2026-11-07,,e1,2026-11-03T22:30:00Z,manual,e2');
    expect(lines[2]).toContain("CORRECTION");
    expect(lines[2]).toContain("reverses e1: wrong price");
  });
});
