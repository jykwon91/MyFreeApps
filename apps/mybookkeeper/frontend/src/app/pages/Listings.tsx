import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { LoadingButton, useLiveSearchParams } from "@platform/ui";
import { useListingsPages } from "@mybookkeeper/api-client/hooks/useListingsPages";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { LISTING_STATUSES } from "@mybookkeeper/api-client/constants/listingLabels";
import type { ListingStatus } from "@mybookkeeper/api-client/types/listing/listing-status";
import type { ListingSummary } from "@mybookkeeper/api-client/types/listing/listing-summary";
import ListingStatusFilter from "@/app/features/listings/ListingStatusFilter";
import ListingForm from "@/app/features/listings/ListingForm";
import { pagedListView } from "@/shared/lib/paged-list-view";
import ListingsListBody from "@/app/features/listings/ListingsListBody";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";

const STATUS_PARAM = "status";

function parseStatusParam(value: string | null): ListingStatus | null {
  if (value === null) return null;
  return (LISTING_STATUSES as readonly string[]).includes(value) ? (value as ListingStatus) : null;
}

export default function Listings() {
  const [searchParams, setSearchParams] = useLiveSearchParams();
  const status = parseStatusParam(searchParams.get(STATUS_PARAM));
  const [showForm, setShowForm] = useState(false);
  const canWrite = useCanWrite();

  const queryArgs = useMemo(() => (status ? { status } : {}), [status]);
  const pages = useListingsPages(queryArgs);
  const { mode, rows } = pagedListView(pages, pages.listings);
  const { data: properties = [] } = useGetPropertiesQuery();

  const propertyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of properties) {
      map.set(p.id, p.name);
    }
    return map;
  }, [properties]);

  function handleFilterChange(next: ListingStatus | null) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) {
          params.set(STATUS_PARAM, next);
        } else {
          params.delete(STATUS_PARAM);
        }
        return params;
      },
      { replace: true },
    );
  }

  const propertyName = (l: ListingSummary) => propertyById.get(l.property_id) ?? "Unknown property";

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Listings"
        subtitle="Rooms and units you have available for rent."
        actions={
          canWrite ? (
            <LoadingButton
              onClick={() => setShowForm(true)}
              isLoading={false}
              data-testid="new-listing-button"
            >
              <Plus className="h-4 w-4 mr-1" />
              New listing
            </LoadingButton>
          ) : undefined
        }
      />

      <ListingStatusFilter value={status} onChange={handleFilterChange} />

      <ListPagesErrorAlert pages={pages} noun="listings" />

      <ListingsListBody
        mode={mode}
        listings={rows}
        propertyName={propertyName}
        hasMore={pages.hasNextPage}
        isLoadingMore={pages.isFetchingNextPage}
        onLoadMore={pages.loadMore}
        canWrite={canWrite}
      />

      {canWrite && showForm ? (
        <ListingForm
          properties={properties}
          onClose={() => setShowForm(false)}
        />
      ) : null}
    </div>
  );
}
