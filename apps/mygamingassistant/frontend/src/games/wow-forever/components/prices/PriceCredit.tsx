import PriceCreditLine from "@/games/wow-forever/components/prices/PriceCreditLine";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";

/** "Prices from TradeSkillMaster (US) · updated 3 hours ago". */
export default function PriceCredit({ prices }: { prices: AuctionPrices }) {
  return (
    <div className="text-xs text-muted-foreground" data-testid="price-credit">
      <PriceCreditLine credit={prices.credit} sourceUpdatedAt={prices.sourceUpdatedAt} hasPrices={prices.byId.size > 0} />
    </div>
  );
}
