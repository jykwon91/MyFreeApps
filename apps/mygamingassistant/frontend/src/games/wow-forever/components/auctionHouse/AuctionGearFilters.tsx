import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { ChevronDown } from "lucide-react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import AuctionFilterChips from "@/games/wow-forever/components/auctionHouse/AuctionFilterChips";
import AuctionRangeFields from "@/games/wow-forever/components/auctionHouse/AuctionRangeFields";
import FilterChipsSkeleton from "@/games/wow-forever/components/auctionHouse/FilterChipsSkeleton";
import { AUCTION_LOAD_COPY, FILTER_PANEL_COPY, usableChipLabel } from "@/games/wow-forever/data/auctionHouse/auctionFilterLabels";
import { GEAR_SKELETON_CHIPS, LEVEL_FILTER_DECIMALS, MAX_FILTER_LEVEL, MIN_FILTER_LEVEL, SLOT_CHIPS, TYPE_CHIPS, USABLE_CHIP_ID } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";
import type { ClientItemsState } from "@/games/wow-forever/hooks/useClientItems";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

interface AuctionGearFiltersProps {
  filters: AuctionFilters;
  onFilters: (patch: Partial<AuctionFilters>) => void;
  /** The game's item list; asked for only once this group is open (or a gear filter is already on). */
  gear: ClientItemsState;
  open: boolean;
  onToggleOpen: () => void;
  /** The player's class, e.g. "Warlock". */
  classLabel: string;
}

/** Slot, armor/weapon type, required level and "usable by my class": a group that loads the item list when opened. */
export default function AuctionGearFilters({ filters, onFilters, gear, open, onToggleOpen, classLabel }: AuctionGearFiltersProps) {
  return (
    <div className="space-y-3" data-testid="auction-gear-group">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggleOpen}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md border bg-card px-3 text-left text-sm font-medium hover:bg-muted/40"
      >
        <span>{FILTER_PANEL_COPY.gearToggle}</span>
        <ChevronDown className={open ? "size-4 rotate-180" : "size-4"} aria-hidden />
      </button>
      {open && gear.status === LOAD_STATUS.loading && <FilterChipsSkeleton label={FILTER_PANEL_COPY.gearLoading} count={GEAR_SKELETON_CHIPS} testId="auction-gear-skeleton" />}
      {open && gear.status === LOAD_STATUS.error && (
        <LoadErrorRetry message={AUCTION_LOAD_COPY.gearError} onRetry={gear.retry} retrying={gear.retrying} />
      )}
      {open && gear.status === LOAD_STATUS.ready && (
        <div className="space-y-4">
          <AuctionFilterChips
            legend={FILTER_PANEL_COPY.slot}
            options={SLOT_CHIPS}
            value={filters.slot ? [filters.slot] : []}
            onToggle={(slot) => onFilters({ slot: slot === filters.slot ? null : slot })}
            testId="auction-filter-slot"
          />
          <AuctionFilterChips
            legend={FILTER_PANEL_COPY.type}
            options={TYPE_CHIPS}
            value={filters.itemType ? [filters.itemType] : []}
            onToggle={(itemType) => onFilters({ itemType: itemType === filters.itemType ? null : itemType })}
            testId="auction-filter-type"
          />
          <AuctionRangeFields
            legend={FILTER_PANEL_COPY.level}
            minLabel={FILTER_PANEL_COPY.fromLevel}
            maxLabel={FILTER_PANEL_COPY.toLevel}
            min={filters.minLevel}
            max={filters.maxLevel}
            onChange={(minLevel, maxLevel) => onFilters({ minLevel, maxLevel })}
            lowest={MIN_FILTER_LEVEL}
            limit={MAX_FILTER_LEVEL}
            decimals={LEVEL_FILTER_DECIMALS}
            testId="auction-filter-level"
          />
          <AuctionFilterChips
            legend={FILTER_PANEL_COPY.classGroup}
            options={[{ id: USABLE_CHIP_ID, label: usableChipLabel(classLabel) }]}
            value={filters.usable ? [USABLE_CHIP_ID] : []}
            onToggle={() => onFilters({ usable: !filters.usable })}
            testId="auction-filter-usable"
          />
        </div>
      )}
    </div>
  );
}
