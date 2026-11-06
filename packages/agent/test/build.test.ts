import { computeDebts, effectiveEntries, type Entry, type SaleEntry, type PaymentEntry } from "@trustbook/ledger";
import { describe, expect, it } from "vitest";
import { buildDraft, matchName, type BuildContext } from "../src/build";
import { Proposal } from "../src/proposal";

// 2026-11-06 is a Friday; 10:30 Lagos time.
const NOW = "2026-11-06T10:30:00+01:00";
const customers = [
  { id: "c-tunde", name: "Tunde" },
  { id: "c-ngozi", name: "Mama Ngozi" },
  { id: "c-amaka", name: "Amaka" },
  { id: "c-amaka2", name: "Amaka Obi" },
];
const items = [
  { id: "eggs", name: "Eggs (crate)" },
  { id: "rice", name: "Rice (50kg bag)" },
];

function ctx(entries: Entry[] = []): BuildContext {
  let n = 0;
  return {
    shopId: "s1",
    timezone: "Africa/Lagos",
    now: NOW,
    customers,
    items,
    debts: computeDebts(effectiveEntries(entries), { shopId: "s1", timezone: "Africa/Lagos", openingCashKobo: 0, defaultDueDays: 14 }, "2026-11-06"),
    newId: () => `new${++n}`,
    source: "text",
  };
}
const p = (x: Partial<Proposal> & { kind: Proposal["kind"] }) => Proposal.parse({ clarifications: [], ...x });

describe("matching names", () => {
  it("matches exact, partial and small spelling slips", () => {
    expect(matchName("tunde", customers).match?.id).toBe("c-tunde");
    expect(matchName("Ngozi", customers).match?.id).toBe("c-ngozi");
    expect(matchName("Tundee", customers).match?.id).toBe("c-tunde");
    expect(matchName("crates egg", items).match?.id).toBe("eggs");
  });
  it("reports several candidates instead of guessing", () => {
    expect(matchName("Amaka", customers).match?.id).toBe("c-amaka"); // exact wins
    expect(matchName("Ama", customers).candidates.length).toBe(2);
  });
});

describe("building a sale", () => {
  it("turns the brief's Pidgin example into a credit sale due next Friday", () => {
    const d = buildDraft(p({ kind: "record_sale", customerName: "Tunde", items: [{ name: "crates egg", qty: "2" }], total: "9k", onCredit: true, promiseDatePhrase: "Friday" }), ctx());
    expect(d.questions).toEqual([]);
    const sale = d.entries[0] as SaleEntry;
    expect(sale).toMatchObject({ type: "SALE", customerId: "c-tunde", totalKobo: 900_000, paidNowKobo: 0, promisedDate: "2026-11-13" });
    expect(sale.items).toEqual([{ itemId: "eggs", qty: 2, unitPriceKobo: 450_000 }]);
    expect(sale.occurredAt).toBe(NOW);
    expect(d.lines.at(-1)).toContain("on credit ₦9,000");
  });
  it("asks when a total cannot split evenly into a per-unit price", () => {
    const d = buildDraft(p({ kind: "record_sale", items: [{ name: "eggs", qty: "3" }], total: "1000.01", paidInFull: true }), ctx());
    expect(d.entries).toEqual([]);
    expect(d.questions[0]).toMatch(/for all 3 eggs, or for each one/);
  });
  it("asks whether a named customer paid when the note does not say", () => {
    const d = buildDraft(p({ kind: "record_sale", customerName: "Tunde", items: [{ name: "eggs", qty: "1", unitPrice: "4500" }] }), ctx());
    expect(d.entries).toEqual([]);
    expect(d.questions).toEqual(["Did Tunde pay now, or is it on credit?"]);
  });
  it("treats an unnamed sale with no other information as paid in full", () => {
    const d = buildDraft(p({ kind: "record_sale", items: [{ name: "rice", qty: "1", unitPrice: "85k" }] }), ctx());
    expect(d.entries[0]).toMatchObject({ totalKobo: 8_500_000, paidNowKobo: 8_500_000 });
  });
  it("adds a new customer and a new item, and warns that profit needs a cost price", () => {
    const d = buildDraft(p({ kind: "record_sale", customerName: "Bola", items: [{ name: "sardine", qty: "4", unitPrice: "1,200" }], paidNow: "2k" }), ctx());
    expect(d.questions).toEqual([]);
    expect(d.newCustomers).toEqual([{ id: "new1", name: "Bola" }]);
    expect(d.newItems).toEqual([{ id: "new2", name: "Sardine" }]);
    expect(d.entries[0]).toMatchObject({ customerId: "new1", totalKobo: 480_000, paidNowKobo: 200_000 });
    expect(d.notes.join(" ")).toMatch(/no cost price/);
  });
  it("records a sale on an earlier day when the note says so", () => {
    const d = buildDraft(p({ kind: "record_sale", items: [{ name: "rice", qty: "1", unitPrice: "85k" }], paidInFull: true, whenPhrase: "yesterday" }), ctx());
    expect(d.entries[0]!.occurredAt).toBe("2026-11-05T10:30:00+01:00");
    expect(d.entries[0]!.recordedAt).toBe(NOW);
  });
  it("flags a total that disagrees with the item prices", () => {
    const d = buildDraft(p({ kind: "record_sale", items: [{ name: "rice", qty: "2", unitPrice: "85k" }], total: "150k", paidInFull: true }), ctx());
    expect(d.entries).toEqual([]);
    expect(d.questions[0]).toMatch(/add up to ₦170,000 but the total says ₦150,000/);
  });
  it("passes the model's own clarifications through and saves nothing", () => {
    const d = buildDraft(p({ kind: "record_sale", items: [{ name: "rice", qty: "1", unitPrice: "85k" }], paidInFull: true, clarifications: ["Was it one bag or one cup?"] }), ctx());
    expect(d.entries).toEqual([]);
    expect(d.questions).toEqual(["Was it one bag or one cup?"]);
  });
});

describe("building payments, promises and expenses", () => {
  const debt: Entry = {
    id: "sale1", shopId: "s1", occurredAt: "2026-11-01T10:00:00+01:00", recordedAt: "2026-11-01T10:00:00+01:00", source: "manual", confirmedBy: "owner",
    type: "SALE", items: [{ itemId: "eggs", qty: 2, unitPriceKobo: 450_000 }], totalKobo: 900_000, paidNowKobo: 0, customerId: "c-ngozi",
  };
  it("allocates a payment oldest-first and says what is left", () => {
    const d = buildDraft(p({ kind: "record_payment", customerName: "Mama Ngozi", amount: "5k" }), ctx([debt]));
    expect(d.entries[0] as PaymentEntry).toMatchObject({ customerId: "c-ngozi", amountKobo: 500_000, method: "cash", allocations: [{ saleId: "sale1", amountKobo: 500_000 }] });
    expect(d.lines[1]).toBe("Still owes ₦4,000 after this");
  });
  it("refuses a payment from an unknown customer", () => {
    const d = buildDraft(p({ kind: "record_payment", customerName: "Zainab", amount: "5k" }), ctx());
    expect(d.entries).toEqual([]);
    expect(d.questions[0]).toMatch(/don't know a customer called Zainab/);
  });
  it("records a promise for next Friday", () => {
    const d = buildDraft(p({ kind: "add_promise", customerName: "Tunde", promiseDatePhrase: "next Friday" }), ctx());
    expect(d.entries[0]).toMatchObject({ type: "PROMISE", customerId: "c-tunde", promisedDate: "2026-11-13" });
  });
  it("records an expense", () => {
    const d = buildDraft(p({ kind: "record_expense", amount: "1,500", category: "Transport" }), ctx());
    expect(d.entries[0]).toMatchObject({ type: "EXPENSE", amountKobo: 150_000, category: "transport" });
  });
  it("records a purchase with part still owed to the supplier", () => {
    const d = buildDraft(p({ kind: "record_purchase", supplier: "Alhaji", items: [{ name: "crates egg", qty: "10", lineTotal: "38k" }], paidNow: "20k" }), ctx());
    expect(d.entries[0]).toMatchObject({ type: "PURCHASE", totalKobo: 3_800_000, paidNowKobo: 2_000_000, supplier: "Alhaji", items: [{ itemId: "eggs", qty: 10, unitCostKobo: 380_000 }] });
  });
});
