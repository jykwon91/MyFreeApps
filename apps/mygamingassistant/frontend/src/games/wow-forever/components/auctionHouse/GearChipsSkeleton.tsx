import { FILTER_PANEL_COPY } from "@/games/wow-forever/data/auctionHouse/auctionFilterLabels";
import { GEAR_SKELETON_CHIPS } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";

/** Placeholder chips while the game's item list loads. */
export default function GearChipsSkeleton() {
  return (
    <div className="flex flex-wrap gap-2" aria-busy="true" aria-label={FILTER_PANEL_COPY.gearLoading} data-testid="auction-gear-skeleton">
      {Array.from({ length: GEAR_SKELETON_CHIPS }, (_, i) => (
        <div key={i} className="h-11 w-20 animate-pulse rounded-full bg-muted/40" aria-hidden />
      ))}
    </div>
  );
}
