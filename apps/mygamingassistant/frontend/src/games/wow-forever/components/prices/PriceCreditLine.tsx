import { OutboundLink } from "@platform/ui/discord-activity";
import { AUCTION_PRICE_REGION_LABEL } from "@/games/wow-forever/data/auctionPriceRegion";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import type { PriceCredit } from "@/games/wow-forever/types/priceCredit";

/** "updated 3 hours ago" re-reads the clock this often. */
const CLOCK_MS = 60_000;

interface PriceCreditLineProps {
  credit: PriceCredit;
  sourceUpdatedAt: string | null;
  hasPrices: boolean;
}

/** "Prices from TradeSkillMaster (US) · updated 3 hours ago" (linked), or that there are none yet. */
export default function PriceCreditLine({ credit, sourceUpdatedAt, hasPrices }: PriceCreditLineProps) {
  useNow(CLOCK_MS);
  const source = (
    <OutboundLink href={credit.url} className="text-primary underline-offset-2 hover:underline">
      {credit.name}
    </OutboundLink>
  );
  if (hasPrices && sourceUpdatedAt) {
    return (
      <p>
        Prices from {source} ({AUCTION_PRICE_REGION_LABEL}) · updated {relativeTime(sourceUpdatedAt)}
      </p>
    );
  }
  return (
    <p>
      No {AUCTION_PRICE_REGION_LABEL} auction prices yet. Prices come from {source}.
    </p>
  );
}
