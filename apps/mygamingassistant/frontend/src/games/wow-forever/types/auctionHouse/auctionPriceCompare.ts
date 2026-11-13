import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

/** A sort comparator over auction prices. */
export type AuctionPriceCompare = (a: AuctionPrice, b: AuctionPrice) => number;
