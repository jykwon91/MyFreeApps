import { useMemo, useState } from "react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import EmptyState from "@/shared/components/ui/EmptyState";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetTenantsQuery } from "@/shared/store/applicantsApi";
import { APPLICANT_PAGE_SIZE } from "@/shared/lib/applicant-labels";
import TenantsListSkeleton from "@/app/features/tenants/TenantsListSkeleton";
import TenantCard from "@/app/features/tenants/TenantCard";
import TenantRow from "@/app/features/tenants/TenantRow";

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

      {isLoading ? (
        <TenantsListSkeleton />
      ) : tenants.length === 0 && !isError ? (
        <EmptyState
          message={
            includeEnded
              ? "No tenants found — active or ended."
              : "No active tenants. When you mark an applicant as 'Lease signed', they'll appear here."
          }
        />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3" data-testid="tenants-mobile">
            {tenants.map((tenant) => (
              <li key={tenant.id}>
                <TenantCard tenant={tenant} />
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div
            className="hidden md:block border rounded-lg overflow-hidden"
            data-testid="tenants-desktop"
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Contract Dates</th>
                  <th className="px-4 py-2 font-medium">Since</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <TenantRow key={tenant.id} tenant={tenant} />
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
