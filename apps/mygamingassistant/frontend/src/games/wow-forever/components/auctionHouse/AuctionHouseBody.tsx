import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import AuctionReadyBody from "@/games/wow-forever/components/auctionHouse/AuctionReadyBody";
import AuctionResultsSkeleton from "@/games/wow-forever/components/auctionHouse/AuctionResultsSkeleton";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

interface AuctionHouseBodyProps {
  faction: PriceFaction;
  query: string;
  sort: AuctionSort;
}

/** Skeleton while loading, a retry if it failed, the results once the prices are in. */
export default function AuctionHouseBody({ faction, query, sort }: AuctionHouseBodyProps) {
  const { status, prices, retry, retrying } = useAuctionPrices(faction);
  if (status === "error") return <LoadErrorRetry message="Couldn't load auction prices." onRetry={retry} retrying={retrying} />;
  if (status === "ready" && prices) return <AuctionReadyBody prices={prices} query={query} sort={sort} />;
  return <AuctionResultsSkeleton />;
}
