import { Skeleton } from "@platform/ui";
import { ITEM_TOOLTIP_SKELETON_LINES as STAT_LINES } from "@/games/wow-forever/data/itemPages/itemTooltipConfig";

/** Stand-in for the equipped block while the character and item list load: its heading, name and a few delta lines. */
export default function ItemCompareSkeleton() {
  return (
    <div
      aria-hidden
      className="w-72 max-w-full rounded-xl border bg-card p-4 space-y-1.5 shadow-lg sm:w-80"
      data-testid="item-compare-skeleton"
    >
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
      {Array.from({ length: STAT_LINES - 2 }, (_, i) => (
        <Skeleton key={i} className="h-3.5 w-2/5" />
      ))}
    </div>
  );
}
