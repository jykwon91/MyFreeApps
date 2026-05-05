import type { InquiriesListMode } from "@/shared/types/inquiry/inquiries-list-mode";
import type { InquirySummary } from "@/shared/types/inquiry/inquiry-summary";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import InquiriesSkeleton from "./InquiriesSkeleton";
import InquiryCard from "./InquiryCard";
import InquiryRow from "./InquiryRow";

export interface InquiriesListBodyProps {
  mode: InquiriesListMode;
  inquiries: InquirySummary[];
  isFiltered: boolean;
  showStageBadge: boolean;
  listingTitleById: Map<string, string>;
  hasMore: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
}

export default function InquiriesListBody({
  mode,
  inquiries,
  isFiltered,
  showStageBadge,
  listingTitleById,
  hasMore,
  isFetching,
  onLoadMore,
}: InquiriesListBodyProps) {
  switch (mode) {
    case "loading":
      return <InquiriesSkeleton />;
    case "empty":
      return (
        <EmptyState
          message={
            isFiltered
              ? "No inquiries in this stage. Try a different filter."
              : 'No inquiries yet. They\'ll land here when guests reach out via Furnished Finder, TNH, or directly. Use "New inquiry" to log one manually.'
          }
        />
      );
    case "list":
      return (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3" data-testid="inquiries-mobile">
            {inquiries.map((inquiry) => (
              <li key={inquiry.id}>
                <InquiryCard
                  inquiry={inquiry}
                  listingTitle={inquiry.listing_id ? listingTitleById.get(inquiry.listing_id) ?? null : null}
                  showStageBadge={showStageBadge}
                />
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div
            className="hidden md:block border rounded-lg overflow-hidden"
            data-testid="inquiries-desktop"
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Inquirer</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Desired Dates</th>
                  <th className="px-4 py-2 font-medium">Employer</th>
                  <th className="px-4 py-2 font-medium">Listing</th>
                  <th className="px-4 py-2 font-medium">Received</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Quality</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inquiry) => (
                  <InquiryRow
                    key={inquiry.id}
                    inquiry={inquiry}
                    listingTitle={inquiry.listing_id ? listingTitleById.get(inquiry.listing_id) ?? null : null}
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
