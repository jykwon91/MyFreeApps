import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { RecipePriceLine } from "@/games/wow-forever/types/auctionHouse/recipePriceLine";

/** A recipe's materials at one auction house's prices, and what its item sells for there. */
export interface RecipePriceBreakdown {
  lines: RecipePriceLine[];
  /** The priced lines added up, in copper. */
  materialsCost: number;
  /** Lines with no auction price (left out of `materialsCost`). */
  unpriced: number;
  /** The item it makes; null for an enchant. */
  product: { itemId: number; name: string; count: number; price: AuctionPrice | null } | null;
}
