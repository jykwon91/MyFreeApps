import { useMemo, useState } from "react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetTenantsQuery } from "@/shared/store/applicantsApi";
import { APPLICANT_PAGE_SIZE } from "@/shared/lib/applicant-labels";
import { useTenantsListMode } from "@/app/features/tenants/useTenantsListMode";
import TenantsListBody from "@/app/features/tenants/TenantsListBody";

export default function Tenants() {
  const [includeEnded, setIncludeEnded] = useState(false);
  const [pageCount, setPageCount] = useState(1);

  const queryArgs = useMemo(
    () => ({
      include_ended: includeEnded,
      limit: APPLICANT_PAGE_SIZE * pageCount,
      offset: 0,
    }),
    [includeEnded, pageCount],
  );

  const { data, isLoading, isFetching, isError, refetch } =
    useGetTenantsQuery(queryArgs);

  const tenants = data?.items ?? [];
  const hasMore = data?.has_more ?? false;

  const mode = useTenantsListMode({ isLoading, isError, tenantCount: tenants.length });

  function handleToggleEnded() {
    setIncludeEnded((prev) => !prev);
    setPageCount(1);
  }

  function handleLoadMore() {
    setPageCount((prev) => prev + 1);
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Tenants"
        subtitle="Applicants you've moved to lease_signed stage. Manage active tenancies here."
      />

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            data-testid="tenants-show-ended-toggle"
            checked={includeEnded}
            onChange={handleToggleEnded}
            className="h-4 w-4 rounded border"
          />
          Show ended tenants
        </label>
      </div>

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load your tenants. Want me to try again?</span>
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

      <TenantsListBody
        mode={mode}
        tenants={tenants}
        includeEnded={includeEnded}
        hasMore={hasMore}
        isFetching={isFetching}
        onLoadMore={handleLoadMore}
      />
    </main>
  );
}
