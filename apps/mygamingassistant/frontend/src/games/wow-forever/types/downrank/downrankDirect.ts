/** A rank's direct part: the amount it lands at once, as the generator wrote it. */
export interface DownrankDirect {
  /** The middle of the roll at the level the rank is learned. */
  base: number;
  /** Added per level past the learn level, up to the rank's max level. */
  perLevel: number;
  /** The roll's spread as a share of `base`: it lands between base × (1 − v/2) and base × (1 + v/2). */
  variance: number;
  /** The share of your +healing / +spell damage this part gets (before penalties). */
  coefficient: number;
}
