import type { TenantsListMode } from "@/shared/types/applicant/tenants-list-mode";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import TenantsListSkeleton from "./TenantsListSkeleton";
import TenantCard from "./TenantCard";
import TenantRow from "./TenantRow";

export interface TenantsListBodyProps {
  mode: TenantsListMode;
  tenants: ApplicantSummary[];
  includeEnded: boolean;
  hasMore: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
}

export default function TenantsListBody({
  mode,
  tenants,
  includeEnded,
  hasMore,
  isFetching,
  onLoadMore,
}: TenantsListBodyProps) {
  switch (mode) {
    case "loading":
      return <TenantsListSkeleton />;
    case "empty":
      return (
        <EmptyState
          message={
            includeEnded
              ? "No tenants found — active or ended."
              : "No active tenants. When you mark an applicant as 'Lease signed', they'll appear here."
          }
        />
      );
    case "list":
      return (
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
