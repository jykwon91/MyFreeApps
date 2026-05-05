import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetListingsQuery } from "@/shared/store/listingsApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { LISTING_PAGE_SIZE, LISTING_STATUSES } from "@/shared/lib/listing-labels";
import type { ListingStatus } from "@/shared/types/listing/listing-status";
import type { ListingSummary } from "@/shared/types/listing/listing-summary";
import ListingStatusFilter from "@/app/features/listings/ListingStatusFilter";
import ListingForm from "@/app/features/listings/ListingForm";
import { useListingsListMode } from "@/app/features/listings/useListingsListMode";
import ListingsListBody from "@/app/features/listings/ListingsListBody";

const STATUS_PARAM = "status";

function parseStatusParam(value: string | null): ListingStatus | null {
  if (value === null) return null;
  return (LISTING_STATUSES as readonly string[]).includes(value) ? (value as ListingStatus) : null;
}

export default function Listings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatusParam(searchParams.get(STATUS_PARAM));
  const [pageCount, setPageCount] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const queryArgs = useMemo(
    () => ({
      ...(status ? { status } : {}),
      limit: LISTING_PAGE_SIZE * pageCount,
      offset: 0,
    }),
    [status, pageCount],
  );

  const { data, isLoading, isFetching, isError, refetch } = useGetListingsQuery(queryArgs);
  const { data: properties = [] } = useGetPropertiesQuery();

  const listings = data?.items ?? [];
  const hasMore = data?.has_more ?? false;

  const propertyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of properties) {
      map.set(p.id, p.name);
    }
    return map;
  }, [properties]);

  function handleFilterChange(next: ListingStatus | null) {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set(STATUS_PARAM, next);
    } else {
      params.delete(STATUS_PARAM);
    }
    setSearchParams(params, { replace: true });
    setPageCount(1);
  }

  function handleLoadMore() {
    setPageCount((prev) => prev + 1);
  }

  const propertyName = (l: ListingSummary) => propertyById.get(l.property_id) ?? "Unknown property";

  const mode = useListingsListMode({ isLoading, isError, listingCount: listings.length });

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Listings"
        subtitle="Rooms and units you have available for rent."
        actions={
          <LoadingButton
            onClick={() => setShowForm(true)}
            isLoading={false}
            data-testid="new-listing-button"
          >
            <Plus className="h-4 w-4 mr-1" />
            New listing
          </LoadingButton>
        }
      />

      <ListingStatusFilter value={status} onChange={handleFilterChange} />

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load your listings. Want me to try again?</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={() => refetch()}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : null}

      <ListingsListBody
        mode={mode}
        listings={listings}
        propertyName={propertyName}
        hasMore={hasMore}
        isFetching={isFetching}
        onLoadMore={handleLoadMore}
      />

      {showForm ? (
        <ListingForm
          properties={properties}
          onClose={() => setShowForm(false)}
        />
      ) : null}
    </main>
  );
}
