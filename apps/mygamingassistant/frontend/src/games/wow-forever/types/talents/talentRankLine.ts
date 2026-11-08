/** One rank's text as the tooltip and the details panel show it. */
export interface TalentRankLine {
  /** 1-based. */
  rank: number;
  /** "This rank" (what you have) or "Next rank" (what one more point gives). */
  label: string;
  /** Forever's text; null = this rank isn't in the game files yet. */
  text: string | null;
  /** Classic's text when Forever changed this rank; null otherwise. */
  classicText: string | null;
  /** Classic's text shown in place of a rank that isn't in the game files yet; null otherwise. */
  fallbackText: string | null;
  /** Forever changed other ranks of this talent, so the Classic fallback may be wrong. */
  changedElsewhere: boolean;
}
