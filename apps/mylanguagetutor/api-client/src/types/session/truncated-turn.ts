/** A learner's answer fitted to the turn limit. */
export interface TruncatedTurn {
  text: string;
  /** Words were dropped to fit. */
  truncated: boolean;
}
