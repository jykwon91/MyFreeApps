import type { NativeScrollEvent } from "react-native";
import { isNearBottom } from "../src/utils/isNearBottom";

function scrolledTo(y: number): NativeScrollEvent {
  return {
    contentOffset: { x: 0, y },
    contentSize: { width: 300, height: 1000 },
    layoutMeasurement: { width: 300, height: 600 },
    contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
    zoomScale: 1,
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
