import { buildDayRecord, entriesRecordedOn, GENESIS, type DayRecord, type Entry } from "@trustbook/ledger";
import { describe, expect, it } from "vitest";
import { decodeSealed, encodeSealed, batchHeader, formatReport, sealCheckpoint, totalsAt, verifyRecovery, type BatchRecord, type CheckpointRecord, type RecoveryInput } from "../src/index";

const SHOP = "s1";
const shop = { name: "Test Shop", ownerName: "Ada", timezone: "Africa/Lagos", openingCashKobo: 0, defaultDueDays: 14, suiAddress: null, mode: "DEMO" as const };
const settings = { shopId: SHOP, timezone: "Africa/Lagos", openingCashKobo: 0, defaultDueDays: 14 };
const at = (d: string) => `${d}T10:00:00+01:00`;
const sale = (id: string, d: string, total: number, customerId?: string, recordedOn = d): Entry => ({
  id, shopId: SHOP, occurredAt: at(d), recordedAt: at(recordedOn), source: "manual", confirmedBy: "owner",
  type: "SALE", items: [{ itemId: "eggs", qty: 1, unitPriceKobo: total }], totalKobo: total, paidNowKobo: customerId ? 0 : total, customerId,
});

const DATES = ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-02", "2026-11-03"];
const ledger: Entry[] = [
  sale("a", "2026-10-29", 100_000),
  sale("b", "2026-10-30", 50_000, "c1"),
  sale("c", "2026-10-31", 70_000),
  sale("d", "2026-11-02", 20_000),
  sale("e", "2026-11-03", 30_000, "c1"),
];

/** Seals days, batches and an October checkpoint, the way the app does. */
function sealed(source: Entry[] = ledger) {
  // Each test tampers with its own copy.
  const entries = structuredClone(source);
  const days: DayRecord[] = [];
  let prev = GENESIS;
  for (const d of DATES) {
    const r = buildDayRecord({ shopId: SHOP, date: d, sealedAt: "2026-11-04T09:00:00+01:00", demo: true, entries: entriesRecordedOn(entries, d, "Africa/Lagos"), prevHash: prev });
    days.push(r);
    prev = r.hash;
  }
  const batch = (from: string, to: string): BatchRecord => ({
    v: 1, kind: "batch", shopId: SHOP, from, to, sealedAt: "2026-11-04T09:00:00+01:00", shop,
    directory: { customers: { c1: { name: "Tunde", phone: null } }, items: { eggs: { name: "Eggs", unit: null } } },
    days: days.filter((x) => x.date >= from && x.date <= to),
  });
  const oct = totalsAt(entries, settings, "2026-10", "2026-11-01T08:00:00+01:00");
  const checkpoint: CheckpointRecord = sealCheckpoint({
    v: 1, kind: "month", shopId: SHOP, month: "2026-10", sealedAt: "2026-11-01T08:00:00+01:00",
    lastDayHash: days[2]!.hash, dayCount: 3, monthTotals: oct.totals, customerBalances: oct.balances,
    behaviourCounts: { "trustbook:s1:behaviour:2026-10": 2 },
  });
  const input: RecoveryInput = {
    shopId: SHOP,
    batches: [{ record: batch("2026-10-29", "2026-10-31"), blobId: "blobA" }, { record: batch("2026-11-02", "2026-11-03"), blobId: "blobB" }],
    checkpoints: [{ record: checkpoint, blobId: "blobC" }],
    anchor: { lastDay: "2026-11-03", headHash: days.at(-1)!.hash, dayCount: 5, lastTxDigest: "TX" },
    behaviourFound: { "trustbook:s1:behaviour:2026-10": 2, "trustbook:s1:behaviour:2026-11": 1 },
  };
  return { days, input };
}
const status = (r: ReturnType<typeof verifyRecovery>, name: string) => r.steps.find((s) => s.name === name)!;

describe("provable recovery", () => {
  it("passes every step on untouched records and rebuilds balances", () => {
    const r = verifyRecovery(sealed().input);
    expect(r.steps.map((s) => [s.name, s.status])).toEqual([
      ["Records found", "PASS"], ["Anchor (Sui)", "PASS"], ["Fingerprints", "PASS"], ["Chain", "PASS"],
      ["Complete vs anchor", "PASS"], ["Totals", "PASS"], ["Balances", "PASS"], ["Behaviour memory", "PASS"],
    ]);
    expect(r.ok).toBe(true);
    expect(r.entries).toHaveLength(5);
    expect(r.balances).toEqual([{ customerId: "c1", name: "Tunde", owedKobo: 80_000 }]);
    expect(status(r, "Behaviour memory").detail).toBe("2/2 memories restored, 1 newer than last seal");
    expect(formatReport(r, "Test Shop", "now")).toContain("RESULT: BOOKS COMPLETE AND UNCHANGED");
  });

  it("TAMPER 1: an edited entry fails fingerprints, naming the day", () => {
    const { input } = sealed();
    const e = input.batches[0]!.record.days[1]!.entries[0] as { totalKobo: number };
    e.totalKobo += 100;
    const r = verifyRecovery(input);
    expect(status(r, "Fingerprints")).toMatchObject({ status: "FAIL", problems: ["day 2026-10-30 was changed"] });
    expect(r.ok).toBe(false);
  });

  it("TAMPER 2: a deleted middle day fails the chain, naming the gap", () => {
    const { input } = sealed();
    input.batches[0]!.record.days.splice(1, 1);
    const r = verifyRecovery(input);
    expect(status(r, "Chain")).toMatchObject({ status: "FAIL", problems: ["missing day record(s) after 2026-10-29 and before 2026-10-31"] });
  });

  it("TAMPER 3: a deleted newest day fails completeness against the anchor", () => {
    const { input } = sealed();
    input.batches[1]!.record.days.pop();
    const r = verifyRecovery(input);
    expect(status(r, "Chain").status).toBe("PASS"); // the chain alone cannot see it
    expect(status(r, "Complete vs anchor")).toMatchObject({ status: "FAIL", detail: "Anchor says 5 days up to 2026-11-03; found 4 up to 2026-11-02." });
  });

  it("TAMPER 4: a changed amount that no longer reconciles fails totals with the kobo difference", () => {
    const { input } = sealed();
    input.checkpoints[0]!.record.monthTotals.revenueKobo += 500;
    // Re-seal so only the reconciliation, not the fingerprint, catches it.
    const { hash: _h, ...rest } = input.checkpoints[0]!.record;
    input.checkpoints[0]!.record = sealCheckpoint(rest);
    const r = verifyRecovery(input);
    expect(status(r, "Totals")).toMatchObject({ status: "FAIL" });
    expect(status(r, "Totals").problems[0]).toBe("2026-10 revenueKobo: rebuilt ₦2,200, sealed ₦2,205 (difference -500 kobo)");
  });

  it("lists a correction recorded after a month closed as an adjustment, not a failure", () => {
    const late = sale("late", "2026-10-31", 5_000, undefined, "2026-11-02");
    const { input } = sealed([...ledger, late]);
    const r = verifyRecovery(input);
    expect(status(r, "Totals").status).toBe("PASS");
    expect(r.adjustmentsAfterClose).toEqual([{ month: "2026-10", entryId: "late", type: "SALE", amountKobo: 5_000, recordedAt: at("2026-11-02") }]);
  });

  it("never reports PASS for a skipped anchor or memory check", () => {
    const { input } = sealed();
    const r = verifyRecovery({ ...input, anchor: null, anchorError: "Tatum unreachable", behaviourFound: null });
    expect(status(r, "Anchor (Sui)")).toMatchObject({ status: "SKIPPED", detail: "Tatum unreachable" });
    expect(status(r, "Complete vs anchor").status).toBe("SKIPPED");
    expect(formatReport(r, "Test Shop", "now")).toContain("RESULT: NO FAILURES (SOME CHECKS SKIPPED)");
  });

  it("round-trips stored text and rejects a header that does not match its content", () => {
    const { input } = sealed();
    const b = input.batches[0]!.record;
    const text = encodeSealed(batchHeader(SHOP, b.from, b.to), b);
    expect(decodeSealed(text)).toMatchObject({ kind: "batch" });
    expect(decodeSealed(text.replace("2026-10-29 2026-10-31", "2026-10-29 2026-10-30"))).toBeNull();
  });
});
