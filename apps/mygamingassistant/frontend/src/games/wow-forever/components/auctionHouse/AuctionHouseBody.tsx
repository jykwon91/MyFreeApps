import { AUCTION_LOAD_COPY } from "@/games/wow-forever/data/auctionHouse/auctionFilterLabels";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import type { ReactNode } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import AuctionResultsSkeleton from "@/games/wow-forever/components/auctionHouse/AuctionResultsSkeleton";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { priceHouseLabel } from "@/games/wow-forever/prices/priceHouseLabel";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

interface AuctionHouseBodyProps {
  faction: PriceFaction;
  /** What to show once the house's prices are in (and it has some). */
  children: (prices: AuctionPrices) => ReactNode;
}

/** Skeleton while loading, a retry if it failed, a note when the house has no prices yet, else `children`. */
export default function AuctionHouseBody({ faction, children }: AuctionHouseBodyProps) {
  const { status, prices, retry, retrying } = useAuctionPrices(faction);
  if (status === LOAD_STATUS.error) return <LoadErrorRetry message={AUCTION_LOAD_COPY.pricesError} onRetry={retry} retrying={retrying} />;
  if (status !== LOAD_STATUS.ready || !prices) return <AuctionResultsSkeleton />;
  if (prices.byId.size === 0) return <EmptyStateNote message={`No ${priceHouseLabel(prices)} auction prices yet.`} />;
  return <>{children(prices)}</>;
}
