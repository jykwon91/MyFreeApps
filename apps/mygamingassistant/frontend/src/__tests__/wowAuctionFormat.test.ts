import { describe, expect, it } from "vitest";
import { itemLabel, onSaleText, priceOrDash } from "@/games/wow-forever/prices/auctionFormat";

describe("onSaleText", () => {
  it("says how many units in how many auctions, with thousands separators", () => {
    expect(onSaleText(23980, 910)).toBe("23,980 in 910 auctions");
    expect(onSaleText(601, 98)).toBe("601 in 98 auctions");
  });

  it("says one auction, not one auctions", () => {
    expect(onSaleText(1, 1)).toBe("1 in 1 auction");
    expect(onSaleText(20, 1)).toBe("20 in 1 auction");
  });
});

describe("priceOrDash", () => {
  it("formats copper and dashes a missing figure", () => {
    expect(priceOrDash(3300)).toBe("33s");
    expect(priceOrDash(null)).toBe("—");
  });
});

describe("itemLabel", () => {
  it("falls back to the item number when the name is missing", () => {
    expect(itemLabel("", 247789)).toBe("Item 247789");
    expect(itemLabel("Pyrite", 249391)).toBe("Pyrite");
  });
});
