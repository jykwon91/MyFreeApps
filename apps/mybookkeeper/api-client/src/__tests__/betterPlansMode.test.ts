import { describe, expect, it } from "vitest";
import { betterPlansMode } from "../utils/betterPlansMode";

const base = { hasSearched: true, isFetching: false, isError: false, groupCount: 2 };

describe("betterPlansMode", () => {
  it("is idle until a search has run", () => {
    expect(betterPlansMode({ ...base, hasSearched: false })).toBe("idle");
  });

  it("is loading while a search is in flight, even before the first one lands", () => {
    expect(betterPlansMode({ ...base, isFetching: true })).toBe("loading");
    expect(betterPlansMode({ ...base, hasSearched: false, isFetching: true })).toBe("loading");
  });

  it("is error when the search failed, and empty when it found no properties", () => {
    expect(betterPlansMode({ ...base, isError: true })).toBe("error");
    expect(betterPlansMode({ ...base, groupCount: 0 })).toBe("empty");
  });

  it("shows results otherwise", () => {
    expect(betterPlansMode(base)).toBe("results");
  });
});
