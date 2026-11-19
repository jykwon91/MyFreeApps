import { useTenantsPages } from "@mybookkeeper/api-client/hooks/useTenantsPages";
import type { TenantsPagesState } from "@mybookkeeper/api-client/types/applicant/tenants-pages-state";
import { buildTenantOptions } from "@mybookkeeper/api-client/utils/tenantStatus";
import { useMemo } from "react";
import { pagedChoices } from "../../lib/pagedChoices";
import type { PagedChoices } from "../../types/PagedChoices";

/**
 * Every tenant, a page at a time, for linking a payment to one. Ended tenants stay in: a final or late payment
 * can arrive after move-out. They sort after the active ones and say "(ended)".
 */
export function useTenantChoices(today: string): PagedChoices<TenantsPagesState> {
  const pages = useTenantsPages({ include_ended: true, today });
  const { tenants } = pages;
  const options = useMemo(
    () => buildTenantOptions(tenants, today).map((option) => ({ value: option.id, label: option.label })),
    [tenants, today],
  );
  return pagedChoices(pages, options);
}
