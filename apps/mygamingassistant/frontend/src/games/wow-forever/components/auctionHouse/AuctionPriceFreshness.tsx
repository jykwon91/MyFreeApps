import PriceRefreshButton from "@/games/wow-forever/components/prices/PriceRefreshButton";
import PriceStatus from "@/games/wow-forever/components/prices/PriceStatus";
import { DEFAULT_PRICE_SERVER } from "@/games/wow-forever/data/priceServers";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

/** The "Prices from Blizzard (…) · updated X" line with "Refresh now" beside it, wrapping under it on a phone. */
export default function AuctionPriceFreshness({ faction }: { faction: PriceFaction }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <PriceStatus faction={faction} withoutPrices="no prices to show" hideError />
      <PriceRefreshButton key={`${DEFAULT_PRICE_SERVER}-${faction}`} house={{ server: DEFAULT_PRICE_SERVER, faction }} />
    </div>
  );
}
