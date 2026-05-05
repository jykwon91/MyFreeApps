import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetVendorsQuery } from "@/shared/store/vendorsApi";
import {
  VENDOR_CATEGORIES,
  VENDOR_PAGE_SIZE,
} from "@/shared/lib/vendor-labels";
import type { VendorCategory } from "@/shared/types/vendor/vendor-category";
import VendorCategoryFilter from "@/app/features/vendors/VendorCategoryFilter";
import VendorPreferredToggle from "@/app/features/vendors/VendorPreferredToggle";
import VendorForm from "@/app/features/vendors/VendorForm";
import { useVendorsListMode } from "@/app/features/vendors/useVendorsListMode";
import VendorsListBody from "@/app/features/vendors/VendorsListBody";

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
  const [showCreateForm, setShowCreateForm] = useState(false);

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

  const mode = useVendorsListMode({ isLoading, isError, vendorCount: vendors.length });

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
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={() => setShowCreateForm(true)}
            data-testid="add-vendor-button"
          >
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
            Add vendor
          </Button>
        }
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

      <VendorsListBody
        mode={mode}
        vendors={vendors}
        isFiltered={isFiltered}
        showCategoryBadge={showCategoryBadge}
        hasMore={hasMore}
        isFetching={isFetching}
        onLoadMore={handleLoadMore}
      />

      {showCreateForm ? (
        <VendorForm onClose={() => setShowCreateForm(false)} />
      ) : null}
    </main>
  );
}
