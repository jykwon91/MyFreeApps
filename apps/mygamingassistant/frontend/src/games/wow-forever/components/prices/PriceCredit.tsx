import { OutboundLink } from "@platform/ui/discord-activity";
import RegionSelect from "@/games/wow-forever/components/shared/RegionSelect";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";

/** "updated 3 hours ago" re-reads the clock this often. */
const CLOCK_MS = 60_000;

/** "Prices from TradeSkillMaster · updated 3 hours ago", with the region the prices are for. */
export default function PriceCredit({ prices, showRegion = true }: { prices: AuctionPrices; showRegion?: boolean }) {
  useNow(CLOCK_MS);
  const source = (
    <OutboundLink href={prices.credit.url} className="text-primary underline-offset-2 hover:underline">
      {prices.credit.name}
    </OutboundLink>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="price-credit">
      {prices.byId.size > 0 && prices.sourceUpdatedAt ? (
        <p>
          Prices from {source} · updated {relativeTime(prices.sourceUpdatedAt)}
        </p>
      ) : (
        <p>No auction prices for this region yet. Prices come from {source}.</p>
      )}
      {showRegion && <RegionSelect />}
    </div>
  );
}
