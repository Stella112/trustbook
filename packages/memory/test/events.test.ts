import type { Entry } from "@trustbook/ledger";
import { describe, expect, it } from "vitest";
import { brokenPromiseEvents, dedupeKeyFor, eventsForNewEntries, parseMemory, recallNamespaces } from "../src/events";

const settings = { shopId: "s1", timezone: "Africa/Lagos", openingCashKobo: 0, defaultDueDays: 14 };
const ctx = { shopId: "s1", settings, today: "2026-11-06", demo: false, customerName: (id: string) => ({ c1: "Tunde" })[id] ?? id };
const base = (id: string, date: string) => ({ id, shopId: "s1", occurredAt: `${date}T10:00:00+01:00`, recordedAt: `${date}T10:00:00+01:00`, source: "manual" as const, confirmedBy: "owner" });
const sale = (id: string, date: string, promisedDate: string): Entry => ({ ...base(id, date), type: "SALE", items: [{ itemId: "eggs", qty: 2, unitPriceKobo: 450_000 }], totalKobo: 900_000, paidNowKobo: 0, customerId: "c1", promisedDate });
const pay = (id: string, date: string): Entry => ({ ...base(id, date), type: "PAYMENT", customerId: "c1", amountKobo: 900_000, method: "cash", allocations: [] });

describe("behaviour memory events", () => {
  it("remembers credit given, with the promised date", () => {
    const [e] = eventsForNewEntries([], [sale("s", "2026-11-01", "2026-11-05")], ctx);
    expect(e).toMatchObject({ kind: "credit", customerId: "c1", dedupeKey: "credit:s", namespace: "trustbook:s1:behaviour:2026-11" });
    expect(JSON.parse(e!.content)).toMatchObject({ v: 1, kind: "credit", customerName: "Tunde", amountKobo: 900_000, occurredAt: "2026-11-01T10:00:00+01:00", summary: "Tunde took ₦9,000 on credit, promising to pay by 2026-11-05." });
  });
  it("remembers a payment and how late it was", () => {
    const events = eventsForNewEntries([sale("s", "2026-11-01", "2026-11-03")], [pay("p", "2026-11-05")], ctx);
    const p = events.find((e) => e.kind === "payment")!;
    expect(JSON.parse(p.content)).toMatchObject({ daysLate: 2, summary: "Tunde paid ₦9,000, 2 days after the promised date." });
  });
  it("remembers an early payment", () => {
    const p = eventsForNewEntries([sale("s", "2026-11-01", "2026-11-05")], [pay("p", "2026-11-03")], ctx).find((e) => e.kind === "payment")!;
    expect(JSON.parse(p.content).summary).toBe("Tunde paid ₦9,000, 2 days early.");
  });
  it("remembers a promise made and then kept", () => {
    const s = sale("s", "2026-11-01", "2026-11-03");
    const promise: Entry = { ...base("pr", "2026-11-03"), type: "PROMISE", customerId: "c1", saleId: "s", promisedDate: "2026-11-05" };
    expect(eventsForNewEntries([s], [promise], ctx).map((e) => e.kind)).toEqual(["promise_made"]);
    const kinds = eventsForNewEntries([s, promise], [pay("p", "2026-11-05")], ctx).map((e) => e.kind);
    expect(kinds).toContain("promise_kept");
  });
  it("remembers a label change with the evidence", () => {
    const history = [sale("a", "2026-09-01", "2026-09-05"), pay("pa", "2026-09-05"), sale("b", "2026-09-10", "2026-09-15"), pay("pb", "2026-09-15")];
    const events = eventsForNewEntries(history, [sale("c", "2026-09-20", "2026-09-25"), pay("pc", "2026-09-25")], ctx);
    const change = events.find((e) => e.kind === "label_change")!;
    expect(JSON.parse(change.content)).toMatchObject({ from: "New", to: "Good payer" });
  });
  it("finds broken promises once their date has passed", () => {
    const s = sale("s", "2026-11-01", "2026-11-03");
    const promise: Entry = { ...base("pr", "2026-11-03"), type: "PROMISE", customerId: "c1", saleId: "s", promisedDate: "2026-11-04" };
    const broken = brokenPromiseEvents([s, promise], ctx);
    expect(broken).toHaveLength(1);
    expect(JSON.parse(broken[0]!.content).summary).toBe("Tunde broke the promise to pay by 2026-11-04.");
    expect(broken[0]!.namespace).toBe("trustbook:s1:behaviour:2026-11");
  });
  it("marks demo memories and reads memories back", () => {
    const [e] = eventsForNewEntries([], [sale("s", "2026-11-01", "2026-11-05")], { ...ctx, demo: true });
    expect(parseMemory(e!.content)).toMatchObject({ kind: "credit", customerId: "c1", demo: true });
    expect(parseMemory("not json")).toBeNull();
  });
  it("recalls from this month and the two before", () => {
    expect(recallNamespaces("s1", "2026-01-15")).toEqual(["trustbook:s1:behaviour:2026-01", "trustbook:s1:behaviour:2025-12", "trustbook:s1:behaviour:2025-11"]);
  });
});

describe("dedupe keys of recovered memories", () => {
  it("gives every recoverable memory the key it was written under", () => {
    const s = sale("s", "2026-11-01", "2026-11-03");
    const promise: Entry = { ...base("pr", "2026-11-03"), type: "PROMISE", customerId: "c1", saleId: "s", promisedDate: "2026-11-05" };
    const late = sale("s2", "2026-10-20", "2026-10-25");
    // The first payment clears the older debt (oldest first); the second keeps the promise.
    const unpaid = { ...sale("s3", "2026-10-28", "2026-10-30"), customerId: "c2" } as Entry;
    const unpaidPromise: Entry = { ...base("pr3", "2026-10-29"), type: "PROMISE", customerId: "c2", saleId: "s3", promisedDate: "2026-10-31" };
    const entries = [late, unpaid, unpaidPromise, s, promise, pay("p0", "2026-11-04"), pay("p", "2026-11-05")];
    const written = [
      ...eventsForNewEntries([], [late], ctx),
      ...eventsForNewEntries([late], [s], ctx),
      ...eventsForNewEntries([late, s], [promise], ctx),
      ...eventsForNewEntries([late, s, promise], [pay("p0", "2026-11-04")], ctx),
      ...eventsForNewEntries([late, s, promise, pay("p0", "2026-11-04")], [pay("p", "2026-11-05")], ctx),
      ...brokenPromiseEvents(entries, ctx),
    ].filter((e) => e.kind !== "label_change");
    expect(written.map((e) => e.kind).sort()).toEqual(["credit", "credit", "payment", "payment", "promise_broken", "promise_kept", "promise_made"].sort());
    for (const e of written) expect(dedupeKeyFor(e.content, entries, settings, ctx.today)).toBe(e.dedupeKey);
  });
  it("returns null for a memory it cannot place", () => {
    expect(dedupeKeyFor('{"v":1,"kind":"payment","customerId":"c1","occurredAt":"2026-01-01T00:00:00Z","amountKobo":1}', [], settings, ctx.today)).toBeNull();
    expect(dedupeKeyFor("not json", [], settings, ctx.today)).toBeNull();
  });
});
