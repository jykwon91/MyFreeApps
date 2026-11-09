import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import PriceCredit from "@/games/wow-forever/components/prices/PriceCredit";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

interface PriceStatusProps {
  /** What the section shows when the prices don't load, e.g. "showing routes without prices". */
  withoutPrices: string;
  /** True when the page shows the failure itself, so it isn't said twice. */
  hideError?: boolean;
  /** Whose auction house; left out = the player's own faction. */
  faction?: PriceFaction;
}

/**
 * The single line above any priced section: whose auction house the prices are
 * from and when Blizzard last listed them. While loading it's a skeleton of that
 * line, and if the prices fail it's a retry. The section still renders either way, only without prices.
 */
export default function PriceStatus({ withoutPrices, hideError = false, faction }: PriceStatusProps) {
  const { status, prices, retry, retrying } = useAuctionPrices(faction);
  if (status === "ready" && prices) return <PriceCredit prices={prices} />;
  if (status === "error" && hideError) return null;
  if (status === "error") {
    return <LoadErrorRetry message={`Couldn't load prices — ${withoutPrices}.`} onRetry={retry} retrying={retrying} />;
  }
  return (
    <div aria-busy="true" aria-label="Loading auction prices" data-testid="price-credit-skeleton">
      <div className="h-4 w-64 max-w-full rounded bg-muted/40 animate-pulse" aria-hidden />
    </div>
  );
}
