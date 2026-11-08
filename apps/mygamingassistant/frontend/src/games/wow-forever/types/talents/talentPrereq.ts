/** A talent that must have `rank` points before another can take any. */
export interface TalentPrereq {
  /** Index of the required talent in its tree's `talents`. */
  talentIndex: number;
  /** Points it needs, 1-based. */
  rank: number;
}
