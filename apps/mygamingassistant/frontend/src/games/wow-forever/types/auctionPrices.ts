import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

/** One faction's US auction-house prices, ready to look up. */
export interface AuctionPrices {
  faction: PriceFaction;
  /** ISO time of Blizzard's newest house snapshot; null when there are no prices yet. */
  sourceUpdatedAt: string | null;
  byId: ReadonlyMap<number, AuctionPrice>;
  /** Lower-cased name. For data that names items but has no ids (the gold farms' cloth and leather). */
  byName: ReadonlyMap<string, AuctionPrice>;
}
