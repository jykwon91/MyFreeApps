import { useMemo } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import AuctionResults from "@/games/wow-forever/components/auctionHouse/AuctionResults";
import AuctionResultsSkeleton from "@/games/wow-forever/components/auctionHouse/AuctionResultsSkeleton";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { searchAuctionItems } from "@/games/wow-forever/prices/auctionSearch";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

interface AuctionHouseBodyProps {
  query: string;
  sort: AuctionSort;
}

interface ReadyBodyProps extends AuctionHouseBodyProps {
  prices: AuctionPrices;
}

function ReadyBody({ prices, query, sort }: ReadyBodyProps) {
  const result = useMemo(() => searchAuctionItems(prices.byId.values(), query, sort), [prices, query, sort]);
  if (prices.byId.size === 0) return <EmptyStateNote message="No US auction prices yet." />;
  return <AuctionResults result={result} query={query} />;
}

/** Skeleton while loading, a retry if it failed, the results once the prices are in. */
export default function AuctionHouseBody({ query, sort }: AuctionHouseBodyProps) {
  const { status, prices, retry, retrying } = useAuctionPrices();
  if (status === "error") return <LoadErrorRetry message="Couldn't load auction prices." onRetry={retry} retrying={retrying} />;
  if (status === "ready" && prices) return <ReadyBody prices={prices} query={query} sort={sort} />;
  return <AuctionResultsSkeleton />;
}
