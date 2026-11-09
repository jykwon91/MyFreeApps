import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { Button, useLiveSearchParams } from "@platform/ui";
import { useGetVendorsQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import {
  VENDOR_CATEGORIES,
  VENDOR_PAGE_SIZE,
} from "@mybookkeeper/api-client/constants/vendorLabels";
import type { VendorCategory } from "@mybookkeeper/api-client/types/vendor/vendor-category";
import VendorCategoryFilter from "@/app/features/vendors/VendorCategoryFilter";
import VendorPreferredToggle from "@/app/features/vendors/VendorPreferredToggle";
import VendorForm from "@/app/features/vendors/VendorForm";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import VendorsListBody from "@/app/features/vendors/VendorsListBody";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

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
  const [searchParams, setSearchParams] = useLiveSearchParams();
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

  const { data, isFetching, error, refetch } =
    useGetVendorsQuery(queryArgs);

  const vendors = data?.items ?? [];
  const hasMore = data?.has_more ?? false;
  const isFiltered = !!category || preferredOnly;
  const showCategoryBadge = !category;

  const mode = resolveListLoadMode({
    hasData: data !== undefined,
    hasError: error !== undefined,
    itemCount: vendors.length,
  });

  function handleCategoryChange(next: VendorCategory | null) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) {
          params.set(CATEGORY_PARAM, next);
        } else {
          params.delete(CATEGORY_PARAM);
        }
        return params;
      },
      { replace: true },
    );
    setPageCount(1);
  }

  function handlePreferredChange(next: boolean) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) {
          params.set(PREFERRED_PARAM, "true");
        } else {
          params.delete(PREFERRED_PARAM);
        }
        return params;
      },
      { replace: true },
    );
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

      {error ? (
        <LoadErrorAlert message="I couldn't load your vendors. Want me to try again?" isRetrying={isFetching} onRetry={() => refetch()} />
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
