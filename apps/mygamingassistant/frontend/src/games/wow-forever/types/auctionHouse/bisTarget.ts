/** Who the top picks are worked out for: the level, and the class (with its spec at the top level, where the spec's weights apply). */
export interface BisTarget {
  level: number;
  /** "Warlock" below the top level; "Affliction Warlock" at it. */
  label: string;
}
