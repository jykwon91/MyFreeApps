import { useMemo } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import AuctionResults from "@/games/wow-forever/components/auctionHouse/AuctionResults";
import AuctionResultsSkeleton from "@/games/wow-forever/components/auctionHouse/AuctionResultsSkeleton";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { PRICE_FACTION_LABEL } from "@/games/wow-forever/data/priceFactions";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { searchAuctionItems } from "@/games/wow-forever/prices/auctionSearch";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

interface AuctionHouseBodyProps {
  faction: PriceFaction;
  query: string;
  sort: AuctionSort;
}

interface ReadyBodyProps {
  prices: AuctionPrices;
  query: string;
  sort: AuctionSort;
}

function ReadyBody({ prices, query, sort }: ReadyBodyProps) {
  const result = useMemo(() => searchAuctionItems(prices.byId.values(), query, sort), [prices, query, sort]);
  if (prices.byId.size === 0) {
    return <EmptyStateNote message={`No ${PRICE_FACTION_LABEL[prices.faction]} auction prices yet.`} />;
  }
  return <AuctionResults result={result} query={query} />;
}

/** Skeleton while loading, a retry if it failed, the results once the prices are in. */
export default function AuctionHouseBody({ faction, query, sort }: AuctionHouseBodyProps) {
  const { status, prices, retry, retrying } = useAuctionPrices(faction);
  if (status === "error") return <LoadErrorRetry message="Couldn't load auction prices." onRetry={retry} retrying={retrying} />;
  if (status === "ready" && prices) return <ReadyBody prices={prices} query={query} sort={sort} />;
  return <AuctionResultsSkeleton />;
}
