import type { ScrollPosition } from "../types/session/scroll-position";

/** Whether a scroll position is within `distance` of the end. */
export function isNearBottom({ contentOffset, contentSize, layoutMeasurement }: ScrollPosition, distance: number): boolean {
  return contentOffset.y + layoutMeasurement.height >= contentSize.height - distance;
}
