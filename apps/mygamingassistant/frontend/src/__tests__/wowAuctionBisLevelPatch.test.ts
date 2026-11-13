import { describe, expect, it } from "vitest";
import { bisLevelPatch, parseBisLevelText } from "@/games/wow-forever/lib/auctionHouse/bisLevelPatch";

describe("bisLevelPatch", () => {
  it("picks for a typed level and turns the picks on when they were off", () => {
    expect(bisLevelPatch("39", null)).toEqual({ bisLevel: 39, bis: "any" });
  });

  it("keeps the rank already chosen", () => {
    expect(bisLevelPatch("39", 2)).toEqual({ bisLevel: 39, bis: 2 });
  });

  it("goes back to the saved level when the box is emptied", () => {
    expect(bisLevelPatch("", "any")).toEqual({ bisLevel: null });
  });

  it("changes nothing for a level out of range or not a whole number", () => {
    expect(bisLevelPatch("0", null)).toBeNull();
    expect(bisLevelPatch("61", null)).toBeNull();
    expect(bisLevelPatch("3.5", null)).toBeNull();
    expect(bisLevelPatch("-4", null)).toBeNull();
    expect(bisLevelPatch("1e", null)).toBeNull();
  });

  it("rejects a leading zero, so the box never rewrites what is being typed", () => {
    expect(parseBisLevelText("07")).toBeNull();
    expect(parseBisLevelText(" 39 ")).toBe(39);
    expect(parseBisLevelText("60")).toBe(60);
  });
});
