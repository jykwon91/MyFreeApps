import { describe, expect, it } from "vitest";
import type { ScrollPosition } from "../types/session/scroll-position";
import { isNearBottom } from "../utils/isNearBottom";

function scrolledTo(y: number): ScrollPosition {
  return {
    contentOffset: { y },
    contentSize: { height: 1000 },
    layoutMeasurement: { height: 600 },
  };
}

describe("isNearBottom", () => {
  it("counts the end, and just short of it, as reading the newest message", () => {
    expect(isNearBottom(scrolledTo(400), 48)).toBe(true);
    expect(isNearBottom(scrolledTo(352), 48)).toBe(true);
  });

  it("doesn't once the reader has scrolled further up", () => {
    expect(isNearBottom(scrolledTo(351), 48)).toBe(false);
    expect(isNearBottom(scrolledTo(0), 48)).toBe(false);
  });
});
