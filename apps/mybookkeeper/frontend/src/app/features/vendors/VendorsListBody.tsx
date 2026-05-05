import type { VendorsListMode } from "@/shared/types/vendor/vendors-list-mode";
import type { VendorSummary } from "@/shared/types/vendor/vendor-summary";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import VendorsListSkeleton from "./VendorsListSkeleton";
import VendorCard from "./VendorCard";
import VendorRow from "./VendorRow";

export interface VendorsListBodyProps {
  mode: VendorsListMode;
  vendors: VendorSummary[];
  isFiltered: boolean;
  showCategoryBadge: boolean;
  hasMore: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
}

export default function VendorsListBody({
  mode,
  vendors,
  isFiltered,
  showCategoryBadge,
  hasMore,
  isFetching,
  onLoadMore,
}: VendorsListBodyProps) {
  switch (mode) {
    case "loading":
      return <VendorsListSkeleton />;
    case "empty":
      return (
        <EmptyState
          message={
            isFiltered
              ? "No vendors match this filter. Try a different category or clear preferred-only."
              : 'No vendors yet — your rolodex is empty. Click "Add vendor" above to get started.'
          }
        />
      );
    case "list":
      return (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3" data-testid="vendors-mobile">
            {vendors.map((vendor) => (
              <li key={vendor.id}>
                <VendorCard vendor={vendor} showCategoryBadge={showCategoryBadge} />
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div
            className="hidden md:block border rounded-lg overflow-hidden"
            data-testid="vendors-desktop"
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Hourly Rate</th>
                  <th className="px-4 py-2 font-medium">Last Used</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <VendorRow key={vendor.id} vendor={vendor} showCategoryBadge={showCategoryBadge} />
                ))}
              </tbody>
            </table>
          </div>

          {hasMore ? (
            <div className="flex justify-center">
              <LoadingButton
                variant="secondary"
                onClick={onLoadMore}
                isLoading={isFetching}
                loadingText="Loading..."
              >
                Load more
              </LoadingButton>
            </div>
          ) : null}
        </>
      );
  }
}
