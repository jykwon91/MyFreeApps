/** Where a scrollable area is scrolled to; a React Native scroll event fits it as is. */
export interface ScrollPosition {
  contentOffset: { y: number };
  contentSize: { height: number };
  layoutMeasurement: { height: number };
}
