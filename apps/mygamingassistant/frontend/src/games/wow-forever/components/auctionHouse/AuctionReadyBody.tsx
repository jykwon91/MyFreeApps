import { useMemo } from "react";
import AuctionResults from "@/games/wow-forever/components/auctionHouse/AuctionResults";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { searchAuctionItems } from "@/games/wow-forever/prices/auctionSearch";
import { priceHouseLabel } from "@/games/wow-forever/prices/priceHouseLabel";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

interface AuctionReadyBodyProps {
  prices: AuctionPrices;
  query: string;
  sort: AuctionSort;
}

/** The loaded house: its search results, or a note when it has no prices yet. */
export default function AuctionReadyBody({ prices, query, sort }: AuctionReadyBodyProps) {
  const result = useMemo(() => searchAuctionItems(prices.byId.values(), query, sort), [prices, query, sort]);
  if (prices.byId.size === 0) {
    return <EmptyStateNote message={`No ${priceHouseLabel(prices)} auction prices yet.`} />;
  }
  return <AuctionResults result={result} query={query} />;
}
