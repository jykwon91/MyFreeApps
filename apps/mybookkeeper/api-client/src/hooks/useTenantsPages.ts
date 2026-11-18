import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListTenantPagesInfiniteQuery } from "../store/applicantsApi";
import type { TenantPageArgs } from "../types/applicant/tenant-page-args";
import type { TenantsPagesState } from "../types/applicant/tenants-pages-state";

/** GET /applicants/tenants a page at a time, active tenants or all of them. Each "Load more" asks for the next page by offset. */
export function useTenantsPages(args: TenantPageArgs): TenantsPagesState {
  const { items, ...pages } = useInfinitePages(useListTenantPagesInfiniteQuery(args));
  return { ...pages, tenants: items };
}
