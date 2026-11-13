import { QUALITY_FILTER_OPTIONS } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";
import type { AuctionQualityFilter } from "@/games/wow-forever/types/auctionHouse/auctionQualityFilter";

/** The chosen qualities with `quality` switched on or off, kept in chip order. Pure. */
export function toggleQuality(current: readonly AuctionQualityFilter[], quality: AuctionQualityFilter): AuctionQualityFilter[] {
  const on = current.includes(quality);
  return QUALITY_FILTER_OPTIONS.filter((q) => (q === quality ? !on : current.includes(q)));
}
