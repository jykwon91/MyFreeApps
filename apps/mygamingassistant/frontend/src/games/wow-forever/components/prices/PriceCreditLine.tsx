import { OutboundLink } from "@platform/ui/discord-activity";
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

/** "Prices from TradeSkillMaster · updated 3 hours ago" (linked), or that the region has none yet. */
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
        Prices from {source} · updated {relativeTime(sourceUpdatedAt)}
      </p>
    );
  }
  return <p>No auction prices for this region yet. Prices come from {source}.</p>;
}
