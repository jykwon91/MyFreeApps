import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { PriceCredit } from "@/games/wow-forever/types/priceCredit";

/** A region's auction-house prices, ready to look up. */
export interface AuctionPrices {
  region: string;
  credit: PriceCredit;
  /** ISO time; null when the region has no prices yet. */
  sourceUpdatedAt: string | null;
  byId: ReadonlyMap<number, AuctionPrice>;
  /** Lower-cased name. For data that names items but has no ids (the gold farms' cloth and leather). */
  byName: ReadonlyMap<string, AuctionPrice>;
}
