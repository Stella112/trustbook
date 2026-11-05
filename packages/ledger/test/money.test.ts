import { describe, expect, it } from "vitest";
import { formatNaira, parseNairaToKobo } from "../src/index";

describe("naira parsing and formatting", () => {
  it("parses whole, decimal, comma and shorthand amounts into kobo", () => {
    expect(parseNairaToKobo("150,000")).toBe(15_000_000);
    expect(parseNairaToKobo("₦2,500.5")).toBe(250_050);
    expect(parseNairaToKobo("0.01")).toBe(1);
    expect(parseNairaToKobo("9k")).toBe(900_000);
    expect(parseNairaToKobo("1.5k")).toBe(150_000);
    expect(parseNairaToKobo("2m")).toBe(200_000_000);
    expect(parseNairaToKobo("0")).toBe(0);
  });
  it("rejects text that is not an amount", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1,2.3.4", "5 naira"]) expect(parseNairaToKobo(bad)).toBeNull();
  });
  it("formats kobo as naira", () => {
    expect(formatNaira(15_000_000)).toBe("₦150,000");
    expect(formatNaira(250_050)).toBe("₦2,500.50");
    expect(formatNaira(-5_000)).toBe("-₦50");
  });
});
