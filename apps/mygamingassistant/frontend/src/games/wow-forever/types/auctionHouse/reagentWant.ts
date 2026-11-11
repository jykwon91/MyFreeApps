/** The most valuable thing a material goes into on one house: what holds its price up. */
export interface ReagentWant {
  recipe: string;
  /** How many of the material one craft takes. */
  count: number;
  /** What one craft's made items sell for on that house, in copper. */
  sells: number;
}
