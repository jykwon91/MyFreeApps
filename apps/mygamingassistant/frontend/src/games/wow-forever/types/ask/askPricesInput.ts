import type { WowRegion } from "@/games/wow-forever/types/wowRegion";

/** `auction_prices`: an item name, how many matches, and a region only when the player named one. */
export interface AskPricesInput {
  query: string;
  limit: number;
  region: WowRegion | null;
}
