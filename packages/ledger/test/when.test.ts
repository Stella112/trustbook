import { describe, expect, it } from "vitest";
import { resolveDate, resolvePeriod } from "../src/index";

// 2026-11-06 is a Friday.
const today = "2026-11-06";

describe("date phrases, resolved in code", () => {
  it("handles today, yesterday, tomorrow and Pidgin 'next tomorrow'", () => {
    expect(resolveDate("today", today, "past")).toBe("2026-11-06");
    expect(resolveDate("yesterday", today, "past")).toBe("2026-11-05");
    expect(resolveDate("tomorrow", today, "future")).toBe("2026-11-07");
    expect(resolveDate("next tomorrow", today, "future")).toBe("2026-11-08");
  });
  it("reads a bare weekday forward for promises and backward for questions", () => {
    expect(resolveDate("Friday", today, "future")).toBe("2026-11-13");
    expect(resolveDate("Monday", today, "future")).toBe("2026-11-09");
    expect(resolveDate("Saturday", today, "past")).toBe("2026-10-31");
    expect(resolveDate("last Saturday", today, "future")).toBe("2026-10-31");
    expect(resolveDate("next Monday", today, "past")).toBe("2026-11-09");
  });
  it("reads day-month dates in either order, and day-first slashes", () => {
    expect(resolveDate("14 October", today, "past")).toBe("2026-10-14");
    expect(resolveDate("14th oct", today, "past")).toBe("2026-10-14");
    expect(resolveDate("October 14", today, "past")).toBe("2026-10-14");
    expect(resolveDate("14/10", today, "past")).toBe("2026-10-14");
    expect(resolveDate("2/12/2026", today, "future")).toBe("2026-12-02");
  });
  it("moves a month-day to the right year", () => {
    expect(resolveDate("20 December", today, "past")).toBe("2025-12-20");
    expect(resolveDate("3 January", today, "future")).toBe("2027-01-03");
  });
  it("ignores leading 'on', 'by' and 'before', and reads Pidgin 'dis'", () => {
    expect(resolveDate("by Friday", today, "future")).toBe("2026-11-13");
    expect(resolveDate("on 14 October", today, "past")).toBe("2026-10-14");
    expect(resolveDate("dis Monday", today, "past")).toBe("2026-11-02");
  });
  it("returns null for phrases it does not understand or impossible dates", () => {
    expect(resolveDate("when he get money", today, "future")).toBeNull();
    expect(resolveDate("31 November", today, "past")).toBeNull();
  });
  it("resolves periods for questions", () => {
    expect(resolvePeriod("this week", today)).toEqual({ from: "2026-11-02", to: "2026-11-06" });
    expect(resolvePeriod("last week", today)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(resolvePeriod("this month", today)).toEqual({ from: "2026-11-01", to: "2026-11-06" });
    expect(resolvePeriod("last month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod("October", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod("14 October", today)).toEqual({ from: "2026-10-14", to: "2026-10-14" });
  });
});
