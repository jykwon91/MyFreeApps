import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { AskLiveState } from "@/games/wow-forever/types/ask/askLiveState";
import type { AskPriceRow } from "@/games/wow-forever/types/ask/askPriceRow";
import type { PriceCredit } from "@/games/wow-forever/types/priceCredit";
import type { WowRegion } from "@/games/wow-forever/types/wowRegion";

/**
 * `auction_prices`: the matches' market values for a region, credited to the
 * source with when it updated them. `none` = no prices for the region yet,
 * `error` = they didn't load (no credit then: nothing came back).
 */
export interface AskPricesCard {
  kind: typeof ASK_CARD.prices;
  region: WowRegion;
  query: string;
  state: AskLiveState;
  rows: AskPriceRow[];
  total: number;
  credit: PriceCredit | null;
  /** ISO time the source worked the prices out; null when unknown. */
  sourceUpdatedAt: string | null;
  pageHref: string;
}
