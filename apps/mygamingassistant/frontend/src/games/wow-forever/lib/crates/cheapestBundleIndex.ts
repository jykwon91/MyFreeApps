/** The index of the lowest cost, skipping unknown (null) costs; the first wins a tie. -1 when none is known. */
export function cheapestBundleIndex(costs: readonly (number | null)[]): number {
  let best = -1;
  costs.forEach((cost, index) => {
    if (cost !== null && (best === -1 || cost < (costs[best] as number))) best = index;
  });
  return best;
}
