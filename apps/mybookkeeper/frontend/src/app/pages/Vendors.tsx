import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import EmptyState from "@/shared/components/ui/EmptyState";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetVendorsQuery } from "@/shared/store/vendorsApi";
import {
  VENDOR_CATEGORIES,
  VENDOR_PAGE_SIZE,
} from "@/shared/lib/vendor-labels";
import type { VendorCategory } from "@/shared/types/vendor/vendor-category";
import VendorsListSkeleton from "@/app/features/vendors/VendorsListSkeleton";
import VendorCategoryFilter from "@/app/features/vendors/VendorCategoryFilter";
import VendorPreferredToggle from "@/app/features/vendors/VendorPreferredToggle";
import VendorCard from "@/app/features/vendors/VendorCard";
import VendorRow from "@/app/features/vendors/VendorRow";

const CATEGORY_PARAM = "category";
const PREFERRED_PARAM = "preferred";

function parseCategoryParam(value: string | null): VendorCategory | null {
  if (value === null) return null;
  return (VENDOR_CATEGORIES as readonly string[]).includes(value)
    ? (value as VendorCategory)
    : null;
}

function parsePreferredParam(value: string | null): boolean {
  return value === "true";
}

export default function Vendors() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = parseCategoryParam(searchParams.get(CATEGORY_PARAM));
  const preferredOnly = parsePreferredParam(searchParams.get(PREFERRED_PARAM));
  const [pageCount, setPageCount] = useState(1);

  const queryArgs = useMemo(
    () => ({
      ...(category ? { category } : {}),
      ...(preferredOnly ? { preferred: true } : {}),
      limit: VENDOR_PAGE_SIZE * pageCount,
      offset: 0,
    }),
    [category, preferredOnly, pageCount],
  );

  const { data, isLoading, isFetching, isError, refetch } =
    useGetVendorsQuery(queryArgs);

  const vendors = data?.items ?? [];
  const hasMore = data?.has_more ?? false;
  const isFiltered = category !== null || preferredOnly;
  const showCategoryBadge = category === null;

  function handleCategoryChange(next: VendorCategory | null) {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set(CATEGORY_PARAM, next);
    } else {
      params.delete(CATEGORY_PARAM);
    }
    setSearchParams(params, { replace: true });
    setPageCount(1);
  }

  function handlePreferredChange(next: boolean) {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set(PREFERRED_PARAM, "true");
    } else {
      params.delete(PREFERRED_PARAM);
    }
    setSearchParams(params, { replace: true });
    setPageCount(1);
  }

  function handleLoadMore() {
    setPageCount((prev) => prev + 1);
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Vendors"
        subtitle="Your rolodex of trusted handymen, plumbers, cleaners, and other trades."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <VendorCategoryFilter value={category} onChange={handleCategoryChange} />
        <VendorPreferredToggle
          value={preferredOnly}
          onChange={handlePreferredChange}
        />
      </div>

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load your vendors. Want me to try again?</span>
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

      {isLoading ? (
        <VendorsListSkeleton />
      ) : vendors.length === 0 && !isError ? (
        <EmptyState
          message={
            isFiltered
              ? "No vendors match this filter. Try a different category or clear preferred-only."
              : "No vendors yet — your rolodex is empty. Adding vendors is coming soon."
          }
        />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3" data-testid="vendors-mobile">
            {vendors.map((vendor) => (
              <li key={vendor.id}>
                <VendorCard
                  vendor={vendor}
                  showCategoryBadge={showCategoryBadge}
                />
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
                  <VendorRow
                    key={vendor.id}
                    vendor={vendor}
                    showCategoryBadge={showCategoryBadge}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {hasMore ? (
            <div className="flex justify-center">
              <LoadingButton
                variant="secondary"
                onClick={handleLoadMore}
                isLoading={isFetching}
                loadingText="Loading..."
              >
                Load more
              </LoadingButton>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
