import { AUCTION_PRICE_REGION_LABEL } from "@/games/wow-forever/data/priceFactions";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import { pricesAreOld } from "@/games/wow-forever/prices/priceFreshness";
import { priceHouseLabel } from "@/games/wow-forever/prices/priceHouseLabel";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";

/** "updated 3 hours ago" re-reads the clock this often. */
const CLOCK_MS = 60_000;

interface PriceCreditLineProps {
  house: PriceHouse;
  sourceUpdatedAt: string | null;
  hasPrices: boolean;
}

/**
 * "Prices from Blizzard (PvP · Alliance AH, US) · updated 3 hours ago", with a
 * warning when they're old — or that there are none for that auction house yet.
 */
export default function PriceCreditLine({ house, sourceUpdatedAt, hasPrices }: PriceCreditLineProps) {
  const now = useNow(CLOCK_MS);
  const label = priceHouseLabel(house);
  if (!hasPrices || !sourceUpdatedAt) {
    return <p>No {label} auction prices yet. They come from Blizzard's auction house and fill in within a few hours.</p>;
  }
  return (
    <p>
      Prices from Blizzard ({label} AH, {AUCTION_PRICE_REGION_LABEL}) · updated {relativeTime(sourceUpdatedAt)}
      {pricesAreOld(sourceUpdatedAt, now) && (
        <span className="text-amber-700 dark:text-amber-400"> · these may be out of date</span>
      )}
    </p>
  );
}
