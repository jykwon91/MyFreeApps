import { Skeleton } from "@platform/ui";
import { ITEM_TOOLTIP_SKELETON_LINES as STAT_LINES } from "@/games/wow-forever/data/itemPages/itemTooltipConfig";

/** Stand-in for the stats block while the item's shard loads: name, then a few stat lines. */
export default function ItemTooltipSkeleton() {
  return (
    <div aria-hidden className="rounded-xl border bg-card p-4 space-y-1.5 shadow-lg" data-testid="item-tooltip-skeleton">
      <Skeleton className="h-4 w-1/2" />
      {Array.from({ length: STAT_LINES }, (_, i) => (
        <Skeleton key={i} className="h-3.5 w-2/5" />
      ))}
    </div>
  );
}
