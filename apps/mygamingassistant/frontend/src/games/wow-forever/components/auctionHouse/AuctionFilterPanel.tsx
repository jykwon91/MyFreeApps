import AuctionFilterChips from "@/games/wow-forever/components/auctionHouse/AuctionFilterChips";
import AuctionGearFilters from "@/games/wow-forever/components/auctionHouse/AuctionGearFilters";
import AuctionMinChoice from "@/games/wow-forever/components/auctionHouse/AuctionMinChoice";
import AuctionRangeFields from "@/games/wow-forever/components/auctionHouse/AuctionRangeFields";
import { FILTER_PANEL_COPY } from "@/games/wow-forever/data/auctionHouse/auctionFilterLabels";
import { GOLD_FILTER_DECIMALS, GOLD_FILTER_STEP, LISTINGS_CHIPS, MAX_FILTER_GOLD, MIN_FILTER_GOLD, QUALITY_CHIPS, QUANTITY_CHIPS } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";
import type { ClientItemsState } from "@/games/wow-forever/hooks/useClientItems";
import { toggleQuality } from "@/games/wow-forever/lib/auctionHouse/toggleQuality";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

interface AuctionFilterPanelProps {
  filters: AuctionFilters;
  onFilters: (patch: Partial<AuctionFilters>) => void;
  gear: ClientItemsState;
  gearOpen: boolean;
  onToggleGear: () => void;
  /** The player's class name, e.g. "Warlock". */
  classLabel: string;
}

/** Every filter group; the same panel sits in the phone's bottom sheet and inline from sm. */
export default function AuctionFilterPanel({ filters, onFilters, gear, gearOpen, onToggleGear, classLabel }: AuctionFilterPanelProps) {
  return (
    <div className="space-y-5" data-testid="auction-filter-panel">
      <AuctionFilterChips
        legend={FILTER_PANEL_COPY.quality}
        options={QUALITY_CHIPS}
        value={filters.qualities}
        onToggle={(quality) => onFilters({ qualities: toggleQuality(filters.qualities, quality) })}
        testId="auction-filter-quality"
      />
      <AuctionRangeFields
        legend={FILTER_PANEL_COPY.price}
        minLabel={FILTER_PANEL_COPY.fromGold}
        maxLabel={FILTER_PANEL_COPY.toGold}
        min={filters.minGold}
        max={filters.maxGold}
        onChange={(minGold, maxGold) => onFilters({ minGold, maxGold })}
        lowest={MIN_FILTER_GOLD}
        limit={MAX_FILTER_GOLD}
        decimals={GOLD_FILTER_DECIMALS}
        step={GOLD_FILTER_STEP}
        testId="auction-filter-price"
      />
      <AuctionMinChoice
        legend={FILTER_PANEL_COPY.quantity}
        chips={QUANTITY_CHIPS}
        value={filters.minQuantity}
        onChange={(minQuantity) => onFilters({ minQuantity })}
        testId="auction-filter-quantity"
      />
      <AuctionMinChoice
        legend={FILTER_PANEL_COPY.listings}
        chips={LISTINGS_CHIPS}
        value={filters.minListings}
        onChange={(minListings) => onFilters({ minListings })}
        testId="auction-filter-listings"
      />
      <AuctionGearFilters filters={filters} onFilters={onFilters} gear={gear} open={gearOpen} onToggleOpen={onToggleGear} classLabel={classLabel} />
    </div>
  );
}
