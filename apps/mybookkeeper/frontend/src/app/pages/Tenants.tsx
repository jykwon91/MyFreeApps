import { useMemo, useState } from "react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { useGetTenantsQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { APPLICANT_PAGE_SIZE } from "@mybookkeeper/api-client/constants/applicantLabels";
import { localToday } from "@platform/core/utils/localToday";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import { currentListData } from "@/shared/utils/current-list-data";
import { usePageCountForFilter } from "@/shared/hooks/usePageCountForFilter";
import TenantsListBody from "@/app/features/tenants/TenantsListBody";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

export default function Tenants() {
  const [includeEnded, setIncludeEnded] = useState(false);
  const { pageCount, loadMore } = usePageCountForFilter(JSON.stringify([includeEnded]));

  const queryArgs = useMemo(
    () => ({
      include_ended: includeEnded,
      today: localToday(),
      limit: APPLICANT_PAGE_SIZE * pageCount,
      offset: 0,
    }),
    [includeEnded, pageCount],
  );

  const query = useGetTenantsQuery(queryArgs);
  const { isFetching, error, refetch } = query;
  const data = currentListData(query, pageCount > 1);

  const tenants = data?.items ?? [];
  const hasMore = data?.has_more ?? false;

  const mode = resolveListLoadMode({
    hasData: data !== undefined,
    hasError: error !== undefined,
    itemCount: tenants.length,
  });

  function handleToggleEnded() {
    setIncludeEnded((prev) => !prev);
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
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

      {error ? (
        <LoadErrorAlert message="I couldn't load your tenants. Want me to try again?" isRetrying={isFetching} onRetry={() => refetch()} />
      ) : null}

      <TenantsListBody
        mode={mode}
        tenants={tenants}
        includeEnded={includeEnded}
        hasMore={hasMore}
        isFetching={isFetching}
        onLoadMore={loadMore}
      />
    </div>
  );
}
