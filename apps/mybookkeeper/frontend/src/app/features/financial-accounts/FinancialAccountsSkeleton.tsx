import { LoadingRegion, Skeleton } from "@platform/ui";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";

const SKELETON_SECTIONS = [3, 2] as const;
const TOTAL_TILES = 3;

/** Same shape as the loaded page: three total tiles, then two sections of account rows. */
export default function FinancialAccountsSkeleton() {
  return (
    <LoadingRegion label={MSG.loading} className="space-y-6" data-testid="financial-accounts-skeleton">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: TOTAL_TILES }, (_, i) => (
          <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="financial-accounts-skeleton-tile">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ))}
      </div>
      {SKELETON_SECTIONS.map((rows, section) => (
        <div key={section} className="space-y-2" data-testid="financial-accounts-skeleton-section">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="financial-accounts-skeleton-row">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ))}
    </LoadingRegion>
  );
}
