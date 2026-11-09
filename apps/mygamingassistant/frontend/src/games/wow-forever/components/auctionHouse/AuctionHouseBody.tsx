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
  if (status === "error") return <LoadErrorRetry message="Couldn't load auction prices." onRetry={retry} retrying={retrying} />;
  if (status !== "ready" || !prices) return <AuctionResultsSkeleton />;
  if (prices.byId.size === 0) return <EmptyStateNote message={`No ${priceHouseLabel(prices)} auction prices yet.`} />;
  return <>{children(prices)}</>;
}
