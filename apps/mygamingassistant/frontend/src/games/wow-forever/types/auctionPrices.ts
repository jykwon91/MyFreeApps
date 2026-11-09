import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceServer } from "@/games/wow-forever/types/priceServer";

/** One auction house's US prices (a server's house for one faction), ready to look up. */
export interface AuctionPrices {
  server: PriceServer;
  faction: PriceFaction;
  /** ISO time of Blizzard's snapshot of this house; null when there are no prices yet. */
  sourceUpdatedAt: string | null;
  byId: ReadonlyMap<number, AuctionPrice>;
  /** Lower-cased name. For data that names items but has no ids (the gold farms' cloth and leather). */
  byName: ReadonlyMap<string, AuctionPrice>;
}
