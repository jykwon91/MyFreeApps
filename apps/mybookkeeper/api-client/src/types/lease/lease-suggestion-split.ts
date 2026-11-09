export interface LeaseSuggestionSplit {
  /** Keys of the suggestions the template has no placeholder for yet. */
  newKeys: ReadonlySet<string>;
  /** How many suggestions the template already has a placeholder for. */
  matchedCount: number;
}
