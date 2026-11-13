import { AUCTION_LOAD_COPY } from "@/games/wow-forever/data/auctionHouse/auctionFilterLabels";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import type { ReactNode } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import AuctionEmptyResults from "@/games/wow-forever/components/auctionHouse/AuctionEmptyResults";
import AuctionResults from "@/games/wow-forever/components/auctionHouse/AuctionResults";
import AuctionResultsNote from "@/games/wow-forever/components/auctionHouse/AuctionResultsNote";
import AuctionResultsSkeleton from "@/games/wow-forever/components/auctionHouse/AuctionResultsSkeleton";
import AuctionStaleBanner from "@/games/wow-forever/components/auctionHouse/AuctionStaleBanner";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { categoryFilterActive, gearFilterActive } from "@/games/wow-forever/lib/auctionHouse/auctionActiveFilters";
import { auctionEmptyMessage } from "@/games/wow-forever/lib/auctionHouse/auctionEmptyMessage";
import { priceHouseLabel } from "@/games/wow-forever/prices/priceHouseLabel";
import type { AuctionPricesState } from "@/games/wow-forever/hooks/useAuctionPrices";
import type { ClientItemsState } from "@/games/wow-forever/hooks/useClientItems";
import type { ItemCategoriesState } from "@/games/wow-forever/hooks/useItemCategories";
import type { ActiveAuctionFilter } from "@/games/wow-forever/types/auctionHouse/activeAuctionFilter";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { AuctionLookupResult } from "@/games/wow-forever/types/auctionHouse/auctionLookupResult";

interface AuctionLookupListProps {
  priceState: AuctionPricesState;
  gear: ClientItemsState;
  categories: ItemCategoriesState;
  filters: AuctionFilters;
  active: readonly ActiveAuctionFilter[];
  /** Null until the prices are in. */
  lookup: AuctionLookupResult | null;
  /** What the list is showing; the paging starts over when it changes. */
  resultsKey: string;
  professionLabel: string | null;
  onClear: () => void;
}

/**
 * What sits under the filters: the prices' error or skeleton, the list (50 at a
 * time) or why it is empty. Changing a filter only swaps the rows; it never shows a spinner.
 */
export default function AuctionLookupList({ priceState, gear, categories, filters, active, lookup, resultsKey, professionLabel, onClear }: AuctionLookupListProps) {
  const { status, prices, retry, retrying } = priceState;
  if (status === LOAD_STATUS.error) return <LoadErrorRetry message={AUCTION_LOAD_COPY.pricesError} onRetry={retry} retrying={retrying} />;
  if (!prices) return <AuctionResultsSkeleton />;
  if (prices.byId.size === 0) return <EmptyStateNote message={`No ${priceHouseLabel(prices)} auction prices yet.`} />;

  const needsGear = gearFilterActive(filters);
  const needsCategories = categoryFilterActive(filters);
  const narrowed = filters.query.trim() !== "" || active.length > 0;
  let body: ReactNode;
  if (needsGear && gear.status === LOAD_STATUS.error) {
    body = <LoadErrorRetry message={AUCTION_LOAD_COPY.gearError} onRetry={gear.retry} retrying={gear.retrying} />;
  } else if (needsCategories && categories.status === LOAD_STATUS.error) {
    body = <LoadErrorRetry message={AUCTION_LOAD_COPY.categoryError} onRetry={categories.retry} retrying={categories.retrying} />;
  } else if (!lookup || (needsGear && gear.status !== LOAD_STATUS.ready) || (needsCategories && categories.status !== LOAD_STATUS.ready)) {
    body = <AuctionResultsSkeleton />;
  } else if (lookup.items.length === 0) {
    const message = auctionEmptyMessage({ query: filters.query, active, professionLabel });
    body = <AuctionEmptyResults message={message} onClear={active.length > 0 ? onClear : null} />;
  } else {
    body = (
      <AuctionResults
        items={lookup.items}
        resultsKey={resultsKey}
        note={(shown) => (
          <AuctionResultsNote total={lookup.items.length} shown={shown} narrowed={narrowed} professionLabel={professionLabel} notOnSale={lookup.notOnSale} />
        )}
      />
    );
  }

  return (
    <div className="space-y-3">
      <AuctionStaleBanner sourceUpdatedAt={prices.sourceUpdatedAt} />
      {body}
    </div>
  );
}
