import { describe, expect, it } from "vitest";
import { itemLabel, soldPerDayText } from "@/games/wow-forever/prices/auctionFormat";

describe("soldPerDayText", () => {
  it("rounds busy items to whole sales with thousands separators", () => {
    expect(soldPerDayText(20238.5)).toBe("20,239");
    expect(soldPerDayText(12.3)).toBe("12");
  });

  it("keeps one decimal under 10 a day", () => {
    expect(soldPerDayText(0.44)).toBe("0.4");
    expect(soldPerDayText(3)).toBe("3");
  });

  it("shows a dash when unknown", () => {
    expect(soldPerDayText(null)).toBe("—");
  });
});

describe("itemLabel", () => {
  it("falls back to the item number when the name is missing", () => {
    expect(itemLabel("", 247789)).toBe("Item 247789");
    expect(itemLabel("Pyrite", 249391)).toBe("Pyrite");
  });
});
