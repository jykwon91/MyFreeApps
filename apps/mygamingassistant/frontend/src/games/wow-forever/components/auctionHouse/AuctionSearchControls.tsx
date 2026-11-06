import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { AUCTION_SORT_OPTIONS, parseAuctionSort } from "@/games/wow-forever/data/auctionSortOptions";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";
import type { WowRegion } from "@/games/wow-forever/types/wowRegion";

const REGION_OPTIONS: readonly { id: WowRegion; label: string }[] = [
  { id: "us", label: "US" },
  { id: "eu", label: "EU" },
];

/** The toggle covers US and EU; a saved Korea or Taiwan region leaves both unpicked. */
function toggleValue(region: WowRegion): WowRegion | null {
  return REGION_OPTIONS.find((o) => o.id === region)?.id ?? null;
}

interface AuctionSearchControlsProps {
  region: WowRegion;
  onRegion: (region: WowRegion) => void;
  query: string;
  onQuery: (query: string) => void;
  sort: AuctionSort;
  onSort: (sort: AuctionSort) => void;
}

const FIELD = "min-h-[44px] rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export default function AuctionSearchControls({ region, onRegion, query, onQuery, sort, onSort }: AuctionSearchControlsProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedToggle label="Region" options={REGION_OPTIONS} value={toggleValue(region)} onChange={onRegion} />
        <p className="text-xs text-muted-foreground">Korea and Taiwan have no TradeSkillMaster data yet.</p>
      </div>
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
    </div>
  );
}
