import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { AskLiveState } from "@/games/wow-forever/types/ask/askLiveState";
import type { AskPriceRow } from "@/games/wow-forever/types/ask/askPriceRow";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";

/**
 * `auction_prices`: the matches' market values on one US auction house (a
 * server's house for one faction), with when Blizzard listed them.
 * `none` = no prices yet, `error` = they didn't load (no credit line then:
 * nothing came back).
 */
export interface AskPricesCard {
  kind: typeof ASK_CARD.prices;
  query: string;
  state: AskLiveState;
  /** Whose auction house was asked about. */
  house: PriceHouse;
  rows: AskPriceRow[];
  total: number;
  /** ISO time of Blizzard's snapshot of that house; null when unknown. */
  sourceUpdatedAt: string | null;
  pageHref: string;
}
