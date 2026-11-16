/** A recipe item any of many mobs can drop, each very rarely: not worth farming one mob for. */
export interface RandomDrop {
  /** How many kinds of mobs drop it. */
  mobs: number;
  levels: readonly [number, number];
  /** The zones it drops most in, best first. */
  zones: readonly string[];
}
