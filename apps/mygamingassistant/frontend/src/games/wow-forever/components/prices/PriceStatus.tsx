import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import PriceCredit from "@/games/wow-forever/components/prices/PriceCredit";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";

interface PriceStatusProps {
  /** What the section shows when the prices don't load, e.g. "showing routes without prices". */
  withoutPrices: string;
}

/**
 * The single line above any priced section: the source credit and when the
 * prices were updated. While loading it's a skeleton of that line, and if the
 * prices fail it's a retry. The section still renders either way, only without prices.
 */
export default function PriceStatus({ withoutPrices }: PriceStatusProps) {
  const { status, prices, retry, retrying } = useAuctionPrices();
  if (status === "ready" && prices) return <PriceCredit prices={prices} />;
  if (status === "error") {
    return <LoadErrorRetry message={`Couldn't load prices — ${withoutPrices}.`} onRetry={retry} retrying={retrying} />;
  }
  return (
    <div className="flex items-center gap-3" aria-busy="true" aria-label="Loading auction prices" data-testid="price-credit-skeleton">
      <div className="h-4 w-56 max-w-full rounded bg-muted/40 animate-pulse" aria-hidden />
      <div className="h-8 w-24 rounded bg-muted/40 animate-pulse" aria-hidden />
    </div>
  );
}
