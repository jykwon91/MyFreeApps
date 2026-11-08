import { AUCTION_SORT_OPTIONS, parseAuctionSort } from "@/games/wow-forever/data/auctionSortOptions";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

interface AuctionSearchControlsProps {
  query: string;
  onQuery: (query: string) => void;
  sort: AuctionSort;
  onSort: (sort: AuctionSort) => void;
}

const FIELD = "min-h-[44px] rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export default function AuctionSearchControls({ query, onQuery, sort, onSort }: AuctionSearchControlsProps) {
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
      <select
        aria-label="Sort by"
        value={sort}
        onChange={(e) => {
          const next = parseAuctionSort(e.target.value);
          if (next) onSort(next);
        }}
        className={`${FIELD} sm:w-52`}
      >
        {AUCTION_SORT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
