import { describe, expect, it } from "vitest";
import { computeDebts, customerHistory, customerRows, dayList, daySummary, effectiveEntries, entriesOn, lastPayment, promisesDueOn, remindersDue, topDebtors } from "../src/index";
import { payment, sale, settings } from "./fixtures";

const s1 = sale("2026-11-01", { paid: 0, customerId: "a", promisedDate: "2026-11-03" });
const s2 = sale("2026-11-01", { paid: 50_000, customerId: "b", promisedDate: "2026-11-03" });
const cash = sale("2026-11-02");
const p = payment("2026-11-03", "a", 100_000);
const all = [s1, s2, cash, p];
const state = computeDebts(effectiveEntries(all), settings, "2026-11-03");

describe("queries", () => {
  it("summarizes a day including credit given", () => {
    expect(daySummary(all, settings, "2026-11-01")).toMatchObject({ revenueKobo: 200_000, cashCollectedKobo: 50_000, creditGivenKobo: 150_000 });
  });
  it("lists a day's entries and the days with activity, newest first", () => {
    expect(entriesOn(all, settings, "2026-11-02").map((e) => e.id)).toEqual([cash.id]);
    expect(dayList(all, settings, "2026-11-01", "2026-11-05").map((d) => d.date)).toEqual(["2026-11-03", "2026-11-02", "2026-11-01"]);
  });
  it("ranks customers by amount owed and finds top debtors", () => {
    expect(customerRows(state, ["a", "b"]).map((r) => [r.customerId, r.owedKobo])).toEqual([["b", 50_000], ["a", 0]]);
    expect(topDebtors(state, 5)).toEqual([{ customerId: "b", owedKobo: 50_000, overdueKobo: 0 }]);
  });
  it("shows promises due today with their status", () => {
    expect(promisesDueOn(state, "2026-11-03").map((x) => [x.customerId, x.status])).toEqual([["a", "paid"], ["b", "due today"]]);
  });
  it("finds a customer's last payment and history", () => {
    expect(lastPayment(all, "a")?.id).toBe(p.id);
    expect(lastPayment(all, "b")).toBeNull();
    expect(customerHistory(all, "a").map((e) => e.id)).toEqual([p.id, s1.id]);
  });
});

describe("reminders due", () => {
  it("lists promised-today first, then the most overdue, and skips paid and future debts", () => {
    const due = [
      sale("2026-11-01", { paid: 0, customerId: "today", promisedDate: "2026-11-06" }),
      sale("2026-10-01", { paid: 0, customerId: "late", promisedDate: "2026-10-20" }),
      sale("2026-11-01", { paid: 0, customerId: "future", promisedDate: "2026-11-09" }),
      sale("2026-11-01", { paid: 0, customerId: "paid", promisedDate: "2026-11-06" }),
      payment("2026-11-05", "paid", 100_000),
    ];
    const r = remindersDue(computeDebts(effectiveEntries(due), settings, "2026-11-06"), "2026-11-06");
    expect(r.map((x) => [x.customerId, x.dueTodayKobo, x.overdueKobo, x.daysOverdue])).toEqual([
      ["today", 100_000, 0, 0],
      ["late", 0, 100_000, 17],
    ]);
  });
});
