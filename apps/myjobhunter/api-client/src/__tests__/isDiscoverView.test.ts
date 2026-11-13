import { describe, expect, it } from "vitest";
import { isDiscoverView } from "../utils/isDiscoverView";

describe("isDiscoverView", () => {
  it("accepts every Discover view", () => {
    expect(["inbox", "saved", "dismissed"].every(isDiscoverView)).toBe(true);
  });

  it("refuses anything else, including the API-only \"all\" and a missing param", () => {
    expect(isDiscoverView("all")).toBe(false);
    expect(isDiscoverView("Dismissed")).toBe(false);
    expect(isDiscoverView(null)).toBe(false);
  });
});
