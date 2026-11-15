/** How to get to a stop from the one before it. */
export interface PlannedLeg {
  seconds: number;
  yards: number;
  /** "walk → fly to Auberdine → boat to Teldrassil". */
  summary: string;
}
