import { useMemo, useState } from "react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { useTenantsPages } from "@mybookkeeper/api-client/hooks/useTenantsPages";
import { localToday } from "@platform/core/utils/localToday";
import { pagedListView } from "@/shared/lib/paged-list-view";
import TenantsListBody from "@/app/features/tenants/TenantsListBody";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";

export default function Tenants() {
  const [includeEnded, setIncludeEnded] = useState(false);

  const queryArgs = useMemo(() => ({ include_ended: includeEnded, today: localToday() }), [includeEnded]);
  const pages = useTenantsPages(queryArgs);
  const { mode, rows } = pagedListView(pages, pages.tenants);

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

      <ListPagesErrorAlert pages={pages} noun="tenants" />

      <TenantsListBody
        mode={mode}
        tenants={rows}
        includeEnded={includeEnded}
        hasMore={pages.hasNextPage}
        isLoadingMore={pages.isFetchingNextPage}
        onLoadMore={pages.loadMore}
      />
    </div>
  );
}
