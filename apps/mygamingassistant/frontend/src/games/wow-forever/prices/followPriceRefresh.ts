import { PRICE_REFRESH_POLL_MS, PRICE_REFRESH_WATCH_TIMEOUT_MS } from "@/games/wow-forever/data/priceRefreshConfig";
import { refreshOutcome } from "@/games/wow-forever/prices/priceRefresh";
import type { PriceRefreshBaseline } from "@/games/wow-forever/types/priceRefreshBaseline";
import type { PriceRefreshState } from "@/games/wow-forever/types/priceRefreshState";

interface FollowPriceRefreshSteps {
  /** Read the house's refresh state from the server now. */
  readState: () => Promise<PriceRefreshState>;
  /** Load the house's new prices past the browser cache. */
  loadFresh: () => Promise<unknown>;
}

/**
 * Follow a refresh the page walked away from to its end: read the house's state every poll until it
 * moves past `baseline`, then, if it brought new prices, load them. A read or load that fails is tried
 * again on the next poll, and the wait ends at the deadline whatever happens, so it never throws.
 */
export async function followPriceRefresh(
  baseline: PriceRefreshBaseline,
  { readState, loadFresh }: FollowPriceRefreshSteps,
): Promise<void> {
  const giveUpAt = Date.now() + PRICE_REFRESH_WATCH_TIMEOUT_MS;
  while (Date.now() < giveUpAt) {
    await new Promise((resolve) => setTimeout(resolve, PRICE_REFRESH_POLL_MS));
    try {
      const outcome = refreshOutcome(baseline, await readState());
      if (outcome === "pending") continue;
      if (outcome === "updated") await loadFresh();
      return;
    } catch {
      // A hiccup (network, a busy server): the next poll tries again.
    }
  }
}
