import { useTenantsPages } from "@mybookkeeper/api-client/hooks/useTenantsPages";
import { useGetApplicantByIdQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { buildTenantOptions } from "@mybookkeeper/api-client/utils/tenantStatus";
import { localToday } from "@platform/core/utils/localToday";
import { pagedListView } from "@/shared/lib/paged-list-view";
import type { TenantSelectOptions } from "@/shared/types/tenant-select-options";

/**
 * Every tenant, ended ones included (a final or late payment can arrive after move-out), a page at a time.
 * A tenant already linked (`selectedId`) who isn't on a loaded page yet is read on its own, so the
 * dropdown still shows their name.
 */
export function useTenantSelectOptions(selectedId: string | null): TenantSelectOptions {
  const today = localToday();
  const pages = useTenantsPages({ include_ended: true, today });
  const { mode, rows } = pagedListView(pages, pages.tenants);
  const isSelectedLoaded = selectedId === null || rows.some((tenant) => tenant.id === selectedId);
  // Asked only once the first page is in, so a tenant on it costs no extra request.
  const { currentData: selected } = useGetApplicantByIdQuery(selectedId ?? "", { skip: isSelectedLoaded || mode !== "list" });
  const tenants = !isSelectedLoaded && selected ? [...rows, selected] : rows;
  const options = buildTenantOptions(tenants, today).map((option) => ({ value: option.id, label: option.label }));
  return { pages, mode, options };
}
