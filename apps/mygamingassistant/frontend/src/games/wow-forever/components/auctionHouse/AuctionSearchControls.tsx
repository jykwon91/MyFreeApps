import AuctionFilterButton from "@/games/wow-forever/components/auctionHouse/AuctionFilterButton";
import { AUCTION_SORT_OPTIONS, parseAuctionSort } from "@/games/wow-forever/data/auctionSortOptions";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

interface AuctionSearchControlsProps {
  query: string;
  onQuery: (query: string) => void;
  sort: AuctionSort;
  onSort: (sort: AuctionSort) => void;
  /** How many filters are on, for the Filters button. */
  filterCount: number;
  filtersOpen: boolean;
  onToggleFilters: () => void;
}

const FIELD = "min-h-[44px] rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

/** The search box, the order, and the Filters button. On a phone the box has a row to itself. */
export default function AuctionSearchControls({ query, onQuery, sort, onSort, filterCount, filtersOpen, onToggleFilters }: AuctionSearchControlsProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <input
        type="search"
        aria-label="Search items"
        placeholder="Item name or item id"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        className={`${FIELD} w-full sm:flex-1`}
      />
      <div className="flex gap-3">
        <select
          aria-label="Sort by"
          value={sort}
          onChange={(e) => {
            const next = parseAuctionSort(e.target.value);
            if (next) onSort(next);
          }}
          className={`${FIELD} min-w-0 flex-1 sm:w-48 sm:flex-none`}
        >
          {AUCTION_SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <AuctionFilterButton count={filterCount} open={filtersOpen} onClick={onToggleFilters} />
      </div>
    </div>
  );
}
