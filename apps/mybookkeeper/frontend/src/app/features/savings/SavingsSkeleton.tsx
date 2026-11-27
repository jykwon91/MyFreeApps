import { LoadingRegion, Skeleton } from "@platform/ui";
import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";
import { SAVINGS_SKELETON_ROWS } from "@/shared/lib/savings-pages";

const HEADER_TILES = 3;
const FILTER_CHIPS = 4;

/** Same shape as the loaded page: three header tiles and the button, the filter chips, then idea rows. */
export default function SavingsSkeleton() {
  return (
    <LoadingRegion label={MSG.loading} className="space-y-6" data-testid="savings-skeleton">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: HEADER_TILES }, (_, i) => (
            <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="savings-skeleton-tile">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-6 w-2/3" />
            </div>
          ))}
        </div>
        <Skeleton className="h-11 w-40" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: FILTER_CHIPS }, (_, i) => (
          <Skeleton key={i} className="h-11 w-24 rounded-full" />
        ))}
      </div>
      <ul className="space-y-2">
        {Array.from({ length: SAVINGS_SKELETON_ROWS }, (_, i) => (
          <li key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="savings-skeleton-row">
            <div className="flex justify-between gap-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-3 w-32" />
          </li>
        ))}
      </ul>
    </LoadingRegion>
  );
}
