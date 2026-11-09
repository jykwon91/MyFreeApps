import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

/** One reagent of a recipe, priced on one auction house. */
export interface RecipePriceLine {
  itemId: number;
  name: string;
  /** How many one craft uses. */
  count: number;
  /** Null = no auctions for it on this house right now. */
  price: AuctionPrice | null;
  /** `count` × market value, in copper; null when there's no price. */
  cost: number | null;
}
