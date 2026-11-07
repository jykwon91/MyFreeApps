/** A route's straight-line yards: one entry per leg (null when its two stops can't be measured, e.g. on two continents). */
export interface RouteDistance {
  legs: readonly (number | null)[];
  /** The sum of the legs; null when any leg can't be measured or there are fewer than two stops. */
  total: number | null;
}
