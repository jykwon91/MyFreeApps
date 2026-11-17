/** What a recipe's materials cost at auction prices. */
export interface MaterialsCost {
  /** Copper for the materials that have a price. */
  total: number;
  /** Names of the materials with no auction price, left out of `total` (never counted as free). */
  missing: readonly string[];
  /** How many materials the recipe takes, so "none of them has a price" can be told apart. */
  materials: number;
}
