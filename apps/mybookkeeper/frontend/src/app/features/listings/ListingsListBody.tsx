import type { ListingsListMode } from "@/shared/types/listing/listings-list-mode";
import type { ListingSummary } from "@/shared/types/listing/listing-summary";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import ListingsSkeleton from "./ListingsSkeleton";
import ListingCard from "./ListingCard";
import ListingTableRow from "./ListingTableRow";

export interface ListingsListBodyProps {
  mode: ListingsListMode;
  listings: ListingSummary[];
  propertyName: (l: ListingSummary) => string;
  hasMore: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
}

export default function ListingsListBody({
  mode,
  listings,
  propertyName,
  hasMore,
  isFetching,
  onLoadMore,
}: ListingsListBodyProps) {
  switch (mode) {
    case "loading":
      return <ListingsSkeleton />;
    case "empty":
      return (
        <EmptyState message="No listings yet. Create your first one to start tracking inquiries from Furnished Finder, Travel Nurse Housing, and direct contacts." />
      );
    case "list":
      return (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3" data-testid="listings-mobile">
            {listings.map((listing) => (
              <li key={listing.id}>
                <ListingCard listing={listing} propertyName={propertyName(listing)} />
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block border rounded-lg overflow-hidden" data-testid="listings-desktop">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Property</th>
                  <th className="px-4 py-2 font-medium">Room Type</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <ListingTableRow
                    key={listing.id}
                    listing={listing}
                    propertyName={propertyName(listing)}
                  />
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
