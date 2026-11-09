import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

/** `auction_prices`: an item name, how many matches, and whose auction house (null = the player's own). */
export interface AskPricesInput {
  query: string;
  limit: number;
  faction: PriceFaction | null;
}
