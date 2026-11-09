import { AUCTION_PRICE_REGION_LABEL, PRICE_FACTION_LABEL } from "@/games/wow-forever/data/priceFactions";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import { pricesAreOld } from "@/games/wow-forever/prices/priceFreshness";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

/** "updated 3 hours ago" re-reads the clock this often. */
const CLOCK_MS = 60_000;

interface PriceCreditLineProps {
  faction: PriceFaction;
  sourceUpdatedAt: string | null;
  hasPrices: boolean;
}

/**
 * "Prices from Blizzard (Alliance AH, US) · updated 3 hours ago", with a warning
 * when they're old — or that there are none for that auction house yet.
 */
export default function PriceCreditLine({ faction, sourceUpdatedAt, hasPrices }: PriceCreditLineProps) {
  const now = useNow(CLOCK_MS);
  const house = PRICE_FACTION_LABEL[faction];
  if (!hasPrices || !sourceUpdatedAt) {
    return <p>No {house} auction prices yet. They come from Blizzard's auction house and fill in within a few hours.</p>;
  }
  return (
    <p>
      Prices from Blizzard ({house} AH, {AUCTION_PRICE_REGION_LABEL}) · updated {relativeTime(sourceUpdatedAt)}
      {pricesAreOld(sourceUpdatedAt, now) && (
        <span className="text-amber-700 dark:text-amber-400"> · these may be out of date</span>
      )}
    </p>
  );
}
