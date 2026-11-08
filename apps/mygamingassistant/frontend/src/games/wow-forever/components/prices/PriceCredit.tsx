import PriceCreditLine from "@/games/wow-forever/components/prices/PriceCreditLine";
import RegionSelect from "@/games/wow-forever/components/shared/RegionSelect";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";

/** "Prices from TradeSkillMaster · updated 3 hours ago", with the region the prices are for. */
export default function PriceCredit({ prices, showRegion = true }: { prices: AuctionPrices; showRegion?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="price-credit">
      <PriceCreditLine credit={prices.credit} sourceUpdatedAt={prices.sourceUpdatedAt} hasPrices={prices.byId.size > 0} />
      {showRegion && <RegionSelect />}
    </div>
  );
}
