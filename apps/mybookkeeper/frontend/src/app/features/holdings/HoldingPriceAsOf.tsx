import { formatAccountDate } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";

export interface HoldingPriceAsOfProps {
  holding: Holding;
}

/** The date a price is from, flagged when it's more than a week old. */
export default function HoldingPriceAsOf({ holding }: HoldingPriceAsOfProps) {
  if (holding.price_as_of === null) return null;
  const date = MSG.priceAsOf(formatAccountDate(holding.price_as_of));
  if (!holding.is_price_stale) return <span className="text-xs text-muted-foreground">{date}</span>;
  return (
    <span className="text-xs text-amber-700 dark:text-amber-400" data-testid="holding-stale-price">
      {MSG.stalePrice} · {date}
    </span>
  );
}
