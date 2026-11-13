import { useCallback, useMemo } from "react";
import { useLiveSearchParams } from "@platform/ui";
import { AUCTION_FILTER_PARAMS } from "@/games/wow-forever/data/auctionHouse/auctionHouseParams";
import { filtersFromParams, writeFiltersToParams } from "@/games/wow-forever/lib/auctionHouse/auctionFilterParams";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { AuctionFiltersState } from "@/games/wow-forever/types/auctionHouse/auctionFiltersState";

/**
 * The Auction house page's search, order and filters, in the URL so a view can
 * be shared and Back returns to it. Anything in the link that isn't an allowed
 * value reads as "not set". The house, profession and recipe params are left alone.
 */
export function useAuctionFilters(): AuctionFiltersState {
  const [params, setParams] = useLiveSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);

  const update = useCallback(
    (patch: Partial<AuctionFilters>) => {
      setParams((prev) => writeFiltersToParams(prev, { ...filtersFromParams(prev), ...patch }), { replace: true });
    },
    [setParams],
  );

  const clear = useCallback(() => {
    setParams(
      (prev) => {
        for (const key of AUCTION_FILTER_PARAMS) prev.delete(key);
        return prev;
      },
      { replace: true },
    );
  }, [setParams]);

  return { filters, update, clear };
}
