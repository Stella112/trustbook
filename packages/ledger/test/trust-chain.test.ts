import { describe, expect, it } from "vitest";
import { buildDayRecord, canonicalize, computeDebts, effectiveEntries, entriesRecordedOn, GENESIS, hashRecord, trustLabel, verifyChain, verifyRecord, type DayRecord, type Entry } from "../src/index";
import { correction, payment, promise, sale, settings, SHOP } from "./fixtures";

const label = (entries: Entry[], asOf: string, customerId = "c1") => trustLabel(computeDebts(effectiveEntries(entries), settings, asOf), customerId);

/** A credit sale promised for `due`, paid in full on `paidOn` (or never). */
function debt(saleDate: string, due: string, paidOn?: string): Entry[] {
  const s = sale(saleDate, { paid: 0, customerId: "c1", promisedDate: due });
  return paidOn ? [s, payment(paidOn, "c1", 100_000, [{ saleId: s.id, amountKobo: 100_000 }])] : [s];
}

describe("trust labels", () => {
  it("is New with fewer than 3 debts settled or due", () => {
    const r = label([...debt("2026-10-01", "2026-10-05", "2026-10-04"), ...debt("2026-10-06", "2026-10-10", "2026-10-09")], "2026-10-20");
    expect(r.label).toBe("New");
    expect(r.considered).toBe(2);
  });
  it("does not count debts that are not yet due", () => {
    const r = label([...debt("2026-10-01", "2026-10-05", "2026-10-04"), ...debt("2026-10-02", "2026-10-30"), ...debt("2026-10-03", "2026-10-30")], "2026-10-20");
    expect(r.considered).toBe(1);
  });
  it("is Good payer at 80%+ on time with average lateness of 2 days or less", () => {
    const entries = [
      ...debt("2026-10-01", "2026-10-05", "2026-10-05"),
      ...debt("2026-10-06", "2026-10-10", "2026-10-09"),
      ...debt("2026-10-11", "2026-10-15", "2026-10-15"),
      ...debt("2026-10-16", "2026-10-20", "2026-10-20"),
      ...debt("2026-10-21", "2026-10-25", "2026-10-27"), // 2 days late
    ];
    const r = label(entries, "2026-11-01");
    expect(r.label).toBe("Good payer");
    expect(r.evidence).toBe("Paid 4 of 5 on time · usually 2 days late");
    expect(r.suggestedLimitKobo).toBeNull();
  });
  it("is Careful when under 50% are on time", () => {
    const entries = [
      ...debt("2026-10-01", "2026-10-05", "2026-10-15"),
      ...debt("2026-10-06", "2026-10-10", "2026-10-19"),
      ...debt("2026-10-11", "2026-10-15", "2026-10-15"),
    ];
    const r = label(entries, "2026-11-01");
    expect(r.label).toBe("Careful");
    expect(r.evidence).toBe("Paid 1 of 3 on time · usually 9 days late");
    expect(r.suggestedLimitKobo).toBe(100_000);
  });
  it("is Careful with a debt more than 30 days overdue, even when most were on time", () => {
    const entries = [
      ...debt("2026-09-01", "2026-09-05", "2026-09-05"),
      ...debt("2026-09-06", "2026-09-10", "2026-09-10"),
      ...debt("2026-09-11", "2026-09-15", "2026-09-15"),
      ...debt("2026-09-16", "2026-09-20", "2026-09-20"),
      ...debt("2026-09-21", "2026-09-25"),
    ];
    const r = label(entries, "2026-10-26");
    expect(r.maxOverdueDays).toBe(31);
    expect(r.label).toBe("Careful");
  });
  it("is Careful after 2 broken promises in 60 days", () => {
    const s = sale("2026-10-01", { paid: 0, customerId: "c1" });
    const entries = [
      ...debt("2026-09-01", "2026-09-05", "2026-09-05"),
      ...debt("2026-09-06", "2026-09-10", "2026-09-10"),
      ...debt("2026-09-11", "2026-09-15", "2026-09-15"),
      ...debt("2026-09-16", "2026-09-20", "2026-09-20"),
      s,
      promise("2026-10-02", "c1", "2026-10-05", s.id),
      promise("2026-10-06", "c1", "2026-10-09", s.id),
      payment("2026-10-12", "c1", 100_000),
    ];
    const r = label(entries, "2026-10-20");
    expect(r.brokenPromises60d).toBe(2);
    expect(r.label).toBe("Careful");
    expect(r.evidence).toContain("2 promises broken");
  });
  it("is Sometimes late between the two", () => {
    const entries = [
      ...debt("2026-10-01", "2026-10-05", "2026-10-05"),
      ...debt("2026-10-06", "2026-10-10", "2026-10-10"),
      ...debt("2026-10-11", "2026-10-15", "2026-10-20"),
    ];
    const r = label(entries, "2026-11-01");
    expect(r.label).toBe("Sometimes late");
    expect(r.suggestedLimitKobo).toBe(100_000);
  });
  it("lets the owner override a label", () => {
    const r = trustLabel(computeDebts([], settings, "2026-11-01"), "c1", "Careful");
    expect(r).toMatchObject({ label: "Careful", overridden: true, evidence: "No credit due yet" });
  });
});

describe("hash chain", () => {
  it("canonicalizes deterministically regardless of key order and drops undefined", () => {
    expect(canonicalize({ b: 1, a: [2, { d: 3, c: "x" }], u: undefined })).toBe('{"a":[2,{"c":"x","d":3}],"b":1}');
    expect(() => canonicalize({ n: Number.NaN })).toThrow();
  });
  it("hashes a record excluding its own hash field", () => {
    const body = { v: 1, x: "y" };
    expect(hashRecord({ ...body, hash: "anything" })).toBe(hashRecord(body));
    expect(hashRecord(body)).toMatch(/^[0-9a-f]{64}$/);
  });

  const days = ["2026-11-01", "2026-11-02", "2026-11-03"];
  function chain(): DayRecord[] {
    const out: DayRecord[] = [];
    let prev = GENESIS;
    for (const date of days) {
      const r = buildDayRecord({ shopId: SHOP, date, sealedAt: `${date}T21:00:00+01:00`, demo: true, entries: [sale(date)], prevHash: prev });
      out.push(r);
      prev = r.hash;
    }
    return out;
  }

  it("builds records whose hash verifies and links from GENESIS", () => {
    const records = chain();
    expect(records.every(verifyRecord)).toBe(true);
    expect(records[0]!.dayTotals).toMatchObject({ entryCount: 1, salesKobo: 100_000, cashInKobo: 100_000 });
    const check = verifyChain(records);
    expect(check).toMatchObject({ ok: true, tampered: [], breaks: [], dayCount: 3, headHash: records[2]!.hash });
  });
  it("names the date of an edited record", () => {
    const records = chain();
    const edited = structuredClone(records);
    (edited[1]!.entries[0] as { totalKobo: number }).totalKobo += 1;
    expect(verifyChain(edited)).toMatchObject({ ok: false, tampered: ["2026-11-02"] });
  });
  it("names the gap when a middle day is deleted", () => {
    const records = chain();
    expect(verifyChain([records[0]!, records[2]!])).toMatchObject({ ok: false, breaks: ["2026-11-03"] });
  });
  it("cannot see a dropped newest day by itself; the head hash changes, which the anchor catches", () => {
    const records = chain();
    const short = verifyChain(records.slice(0, 2));
    expect(short.ok).toBe(true);
    expect(short.headHash).not.toBe(records[2]!.hash);
    expect(short.dayCount).toBe(2);
  });
  it("puts a correction to a past day in the day it was recorded", () => {
    const s = sale("2026-11-01");
    const c = { ...correction("2026-11-03", s), occurredAt: s.occurredAt };
    expect(entriesRecordedOn([s, c], "2026-11-01", "Africa/Lagos").map((e) => e.id)).toEqual([s.id]);
    expect(entriesRecordedOn([s, c], "2026-11-03", "Africa/Lagos").map((e) => e.id)).toEqual([c.id]);
  });
});

describe("Careful before New (approved 6 Nov)", () => {
  it("marks a new customer Careful when a debt is more than 30 days overdue", () => {
    const r = label(debt("2026-09-01", "2026-09-05"), "2026-10-06");
    expect(r.considered).toBe(1);
    expect(r.label).toBe("Careful");
  });
  it("keeps a new customer New after one late payment", () => {
    expect(label(debt("2026-10-01", "2026-10-05", "2026-10-09"), "2026-10-20").label).toBe("New");
  });
});
