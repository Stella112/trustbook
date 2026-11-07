import { describe, expect, it } from "vitest";
import { dedupeKeyFor, isHoldable, weekStartOf, weekSummaryEvent } from "../src/index";

const ctx = { shopId: "s1", timezone: "Africa/Lagos", demo: true, customerName: () => "Tunde" };
const held = (kind: string, fields: Record<string, unknown>, at = "2026-11-03T10:00:00+01:00") => ({ kind, customerId: "c1", occurredAt: at, content: JSON.stringify({ kind, ...fields }) });

describe("monthly memory cap (brief §6.8b)", () => {
  it("holds per-event memories but never lessons, overrides or summaries", () => {
    expect(isHoldable("credit")).toBe(true);
    expect(isHoldable("month_lesson")).toBe(false);
    expect(isHoldable("label_override")).toBe(false);
    expect(isHoldable("week_summary")).toBe(false);
  });
  it("finds the Monday of a week", () => {
    expect(weekStartOf("2026-11-06")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-02")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26");
  });
  it("summarises a customer's held week from the events' own numbers", () => {
    const e = weekSummaryEvent(ctx, "c1", "2026-11-02", "2026-11", [
      held("credit", { amountKobo: 900_000 }),
      held("credit", { amountKobo: 100_000 }),
      held("payment", { amountKobo: 500_000, daysLate: 5 }),
      held("promise_broken", {}),
    ]);
    const j = JSON.parse(e.content);
    expect(j.summary).toBe("Week of 2 Nov–8 Nov: Tunde took ₦10,000 on credit in 2 sales, paid ₦5,000 in 1 payment (1 late, up to 5 days), broke 1 promise.");
    expect(j).toMatchObject({ kind: "week_summary", demo: true, month: "2026-11", counts: { credits: 2, payments: 1, late: 1, broken: 1 } });
    expect(e.namespace).toBe("trustbook:s1:behaviour:2026-11");
    expect(e.dedupeKey).toBe("week:c1:2026-11-02:2026-11");
    expect(dedupeKeyFor(e.content, [], { shopId: "s1", timezone: "Africa/Lagos", openingCashKobo: 0, defaultDueDays: 14 }, "2026-11-10")).toBe(e.dedupeKey);
  });
  it("dates a summary inside its month when the week runs past the month's end", () => {
    const e = weekSummaryEvent(ctx, "c1", "2026-10-26", "2026-10", [held("credit", { amountKobo: 100 }, "2026-10-30T10:00:00+01:00")]);
    expect(e.occurredAt).toBe("2026-10-31T23:59:00+01:00");
  });
});
