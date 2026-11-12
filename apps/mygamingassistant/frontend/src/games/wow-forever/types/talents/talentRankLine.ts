/** One rank's text as the tooltip and the details panel show it. */
export interface TalentRankLine {
  /** 1-based. */
  rank: number;
  /** "This rank" (what you have) or "Next rank" (what one more point gives). */
  label: string;
  /** Forever's text. */
  text: string;
  /** Classic's text when Forever changed this rank; null otherwise. */
  classicText: string | null;
}
