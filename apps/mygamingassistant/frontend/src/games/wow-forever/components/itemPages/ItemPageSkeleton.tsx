import { Skeleton } from "@platform/ui";
import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";

const STAT_LINES = 7;
const SOURCE_ROWS = 3;

/** Stand-in while the item's shards load: header, tooltip block and "How to get it" in the same places. */
export default function ItemPageSkeleton() {
  return (
    <div aria-hidden className="space-y-4" data-testid="item-page-skeleton">
      <div className="flex items-start gap-3">
        <Skeleton className="h-11 w-11 shrink-0" />
        <Skeleton className="h-12 w-12 shrink-0 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-1.5 max-w-md">
        {Array.from({ length: STAT_LINES }, (_, i) => (
          <Skeleton key={i} className={i === 0 ? "h-4 w-1/2" : "h-3.5 w-2/5"} />
        ))}
      </div>
      <div className={DETAIL_SECTION}>
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: SOURCE_ROWS }, (_, i) => (
          <div key={i} className="space-y-1.5 pt-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
