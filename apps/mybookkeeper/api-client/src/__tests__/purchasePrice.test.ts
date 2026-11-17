import { describe, expect, it } from "vitest";
import { cleanPurchasePrice } from "../utils/purchasePrice";

describe("cleanPurchasePrice", () => {
  it("accepts dollar signs, commas and cents", () => {
    expect(cleanPurchasePrice("$250,000")).toBe("250000.00");
    expect(cleanPurchasePrice("199999.5")).toBe("199999.50");
  });

  it("is null for blank, zero, negative, junk or too large", () => {
    expect(cleanPurchasePrice("")).toBeNull();
    expect(cleanPurchasePrice("0")).toBeNull();
    expect(cleanPurchasePrice("-5")).toBeNull();
    expect(cleanPurchasePrice("abc")).toBeNull();
    expect(cleanPurchasePrice("10000000000")).toBeNull();
  });
});
