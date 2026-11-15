import { describe, expect, it } from "vitest";
import { dollarsToCents } from "../utils/dollarsToCents";

describe("dollarsToCents", () => {
  it("converts whole and fractional dollars", () => {
    expect(dollarsToCents("1240")).toBe(124000);
    expect(dollarsToCents("1995.82")).toBe(199582);
    expect(dollarsToCents("0.07")).toBe(7);
  });

  it("treats a blank field as absent, not zero", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("   ")).toBeNull();
  });

  it("keeps an explicit zero", () => {
    expect(dollarsToCents("0")).toBe(0);
  });

  it("returns null for non-numeric input", () => {
    expect(dollarsToCents("abc")).toBeNull();
  });

  it("rounds to the nearest cent and ignores surrounding space", () => {
    expect(dollarsToCents("10.005")).toBe(1001);
    expect(dollarsToCents(" 4.39 ")).toBe(439);
  });
});
