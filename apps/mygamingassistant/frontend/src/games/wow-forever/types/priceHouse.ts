import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceServer } from "@/games/wow-forever/types/priceServer";

/** One auction house: a server's house for one faction. Each house is its own market. */
export interface PriceHouse {
  server: PriceServer;
  faction: PriceFaction;
}
