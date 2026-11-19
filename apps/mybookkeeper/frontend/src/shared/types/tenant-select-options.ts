import type { TenantsPagesState } from "@mybookkeeper/api-client/types/applicant/tenants-pages-state";
import type { ListLoadMode } from "@/shared/types/list-load-mode";
import type { SelectOption } from "@/shared/types/ui/select-option";

/** Every tenant, a page at a time, as choices for a "link this payment to a tenant" dropdown. */
export interface TenantSelectOptions {
  pages: TenantsPagesState;
  mode: ListLoadMode;
  options: SelectOption[];
}
