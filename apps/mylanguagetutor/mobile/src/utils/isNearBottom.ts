import type { NativeScrollEvent } from "react-native";

/** Whether a scroll position is within `distance` points of the end. */
export function isNearBottom({ contentOffset, contentSize, layoutMeasurement }: NativeScrollEvent, distance: number): boolean {
  return contentOffset.y + layoutMeasurement.height >= contentSize.height - distance;
}
