import { computeDebts, effectiveEntries, type Entry } from "@trustbook/ledger";
import { describe, expect, it } from "vitest";
import { answer, type AskContext } from "../src/ask";

const settings = { shopId: "s1", timezone: "Africa/Lagos", openingCashKobo: 0, defaultDueDays: 14 };
const base = (id: string, date: string) => ({ id, shopId: "s1", occurredAt: `${date}T10:00:00+01:00`, recordedAt: `${date}T10:00:00+01:00`, source: "manual" as const, confirmedBy: "owner" });
const entries: Entry[] = [
  { ...base("a", "2026-10-14"), type: "SALE", items: [{ itemId: "eggs", qty: 2, unitPriceKobo: 450_000 }], totalKobo: 900_000, paidNowKobo: 0, customerId: "c-tunde", promisedDate: "2026-10-20" },
  { ...base("b", "2026-10-14"), type: "SALE", items: [{ itemId: "eggs", qty: 1, unitPriceKobo: 450_000 }], totalKobo: 450_000, paidNowKobo: 450_000 },
  { ...base("c", "2026-11-02"), type: "PAYMENT", customerId: "c-tunde", amountKobo: 300_000, method: "cash", allocations: [] },
];
const today = "2026-11-06";
const ctx: AskContext = { entries, settings, today, debts: computeDebts(effectiveEntries(entries), settings, today), customers: [{ id: "c-tunde", name: "Tunde" }] };

describe("answers built only from ledger data", () => {
  it("answers 'Wetin happen on 14 October?'", () => {
    const a = answer({ intent: "day_summary", datePhrase: "14 October" }, ctx);
    expect(a.text).toBe("On Wednesday, 14 October you sold ₦13,500 in 2 sales, gave ₦9,000 on credit, and collected ₦4,500.");
  });
  it("says so when nothing happened that day", () => {
    expect(answer({ intent: "day_summary", datePhrase: "yesterday" }, ctx).text).toMatch(/Nothing was recorded/);
  });
  it("reports a customer's balance, overdue part and label", () => {
    const a = answer({ intent: "customer_balance", customerName: "tunde" }, ctx);
    expect(a.text).toMatch(/^Tunde owes you ₦6,000, and ₦6,000 of it is overdue\. Label: New/);
  });
  it("lists overdue customers and top debtors", () => {
    expect(answer({ intent: "overdue" }, ctx).text).toBe("1 customer is overdue, ₦6,000 in all: Tunde ₦6,000.");
    expect(answer({ intent: "top_debtors" }, ctx).facts).toEqual([{ label: "Tunde", value: "₦6,000" }]);
  });
  it("finds the last payment and the best day", () => {
    expect(answer({ intent: "last_payment", customerName: "Tunde" }, ctx).text).toBe("Tunde last paid ₦3,000 on Monday, 2 November.");
    expect(answer({ intent: "best_day", periodPhrase: "October" }, ctx).text).toMatch(/Wednesday, 14 October, with ₦13,500/);
  });
  it("explains profit is unavailable when cost prices are missing", () => {
    expect(answer({ intent: "period_summary", periodPhrase: "October" }, ctx).text).toMatch(/Profit is unavailable because 1 item has no cost price/);
  });
  it("asks instead of guessing an unknown customer or date", () => {
    expect(answer({ intent: "customer_balance", customerName: "Zainab" }, ctx).text).toBe("I don't know a customer called Zainab.");
    expect(answer({ intent: "day_summary", datePhrase: "when rain fall" }, ctx).text).toMatch(/could not tell which day/);
  });
});
