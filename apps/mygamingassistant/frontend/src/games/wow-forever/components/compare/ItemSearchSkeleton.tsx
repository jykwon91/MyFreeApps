import { Skeleton } from "@platform/ui";
import { SKELETON_ROW_COUNT } from "@/games/wow-forever/data/itemSearchConfig";

/** Stand-in for the result rows while the item list loads (same row height and lines). */
export default function ItemSearchSkeleton() {
  return (
    <ul aria-hidden className="space-y-1" data-testid="item-search-skeleton">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
        <li key={i} className="min-h-[44px] px-3 py-2 flex flex-col justify-center gap-1.5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </li>
      ))}
    </ul>
  );
}
