/** How many inbox postings the AI hasn't scored, or null when the counts aren't known. */
export function unscoredCount(scoredCount: number | null, totalCount: number | null): number | null {
  return scoredCount !== null && totalCount !== null ? totalCount - scoredCount : null;
}
