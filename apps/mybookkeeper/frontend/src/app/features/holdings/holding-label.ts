import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";

/** What a holding is called on screen: its ticker, else its name. */
export function holdingLabel(holding: Holding): string {
  return holding.ticker_symbol ?? holding.name ?? MSG.unnamed;
}
