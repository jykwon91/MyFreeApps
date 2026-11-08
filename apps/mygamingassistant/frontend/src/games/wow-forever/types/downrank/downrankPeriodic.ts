/** A rank's over-time part: a heal or damage that ticks. */
export interface DownrankPeriodic {
  /** One tick at the level the rank is learned. */
  tick: number;
  /** Added to each tick per level past the learn level, up to the rank's max level. */
  perLevel: number;
  ticks: number;
  periodMs: number;
  /** The share of your bonus EACH tick gets (before penalties). */
  coefficient: number;
}
