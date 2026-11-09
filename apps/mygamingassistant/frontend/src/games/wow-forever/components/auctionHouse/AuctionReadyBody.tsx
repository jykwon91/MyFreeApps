import { useMemo } from "react";
import AuctionResults from "@/games/wow-forever/components/auctionHouse/AuctionResults";
import AuctionResultsNote from "@/games/wow-forever/components/auctionHouse/AuctionResultsNote";
import { searchAuctionItems } from "@/games/wow-forever/prices/auctionSearch";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

interface AuctionReadyBodyProps {
  prices: AuctionPrices;
  query: string;
  sort: AuctionSort;
}

/** Every item on the house: the search results. */
export default function AuctionReadyBody({ prices, query, sort }: AuctionReadyBodyProps) {
  const result = useMemo(() => searchAuctionItems(prices.byId.values(), query, sort), [prices, query, sort]);
  return (
    <AuctionResults
      result={result}
      emptyMessage={`No items match "${query.trim()}".`}
      note={<AuctionResultsNote result={result} searching={query.trim() !== ""} />}
    />
  );
}
