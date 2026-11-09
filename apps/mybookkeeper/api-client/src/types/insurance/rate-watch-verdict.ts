/**
 * The one sentence the rate-watch section leads with.
 *
 * The first cut of this screen had no verdict at all — it opened with three
 * full-detail cards and a twenty-row table and left the operator to work out
 * whether any of it mattered. It doesn't have to be read to be understood.
 */
export interface RateWatchVerdict {
  /** `alert` when something is going up, `clear` when nothing is. */
  tone: "alert" | "clear";
  /** The sentence itself. */
  headline: string;
  /** Supporting line: which carrier, how much, by when. */
  detail: string | null;
}
