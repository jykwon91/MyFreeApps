import { LoadingRegion, Skeleton } from "@platform/ui";
import { PLAID_MESSAGES as MSG } from "@/shared/lib/plaid-messages";

const SKELETON_ROWS = 1;

/** Same shape as a loaded connection row: name and status, then its buttons. */
export default function ConnectedBanksSkeleton() {
  return (
    <LoadingRegion label={MSG.loading} className="space-y-2" data-testid="connected-banks-skeleton">
      <Skeleton className="h-3 w-32" />
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="connected-banks-skeleton-row">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}
