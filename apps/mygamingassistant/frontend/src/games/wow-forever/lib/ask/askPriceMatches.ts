import { searchAuctionItems } from "@/games/wow-forever/prices/auctionSearch";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

/**
 * The auction-house lookup's own search (most on sale first), with the item
 * named exactly put first — "Linen Cloth" answers with Linen Cloth, not Bolt of Linen Cloth.
 */
export function askPriceMatches(items: Iterable<AuctionPrice>, query: string): { items: AuctionPrice[]; total: number } {
  const found = searchAuctionItems(items, query, "supply");
  const needle = query.trim().toLowerCase();
  const exact = found.items.filter((item) => item.name.toLowerCase() === needle);
  const rest = found.items.filter((item) => item.name.toLowerCase() !== needle);
  return { items: [...exact, ...rest], total: found.total };
}
