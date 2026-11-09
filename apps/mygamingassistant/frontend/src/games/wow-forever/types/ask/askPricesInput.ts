import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceServer } from "@/games/wow-forever/types/priceServer";

/**
 * `auction_prices`: an item name, how many matches, and whose auction house —
 * faction null = the player's own, server null = the default (PvP).
 */
export interface AskPricesInput {
  query: string;
  limit: number;
  faction: PriceFaction | null;
  server: PriceServer | null;
}
