import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListInsurancePolicyPagesInfiniteQuery } from "../store/insurancePoliciesApi";
import type { InsurancePoliciesPagesState } from "../types/insurance/insurance-policies-pages-state";
import type { InsurancePolicyPageArgs } from "../types/insurance/insurance-policy-page-args";

/** GET /insurance-policies a page at a time, optionally narrowed to policies expiring by a date. */
export function useInsurancePoliciesPages(args: InsurancePolicyPageArgs): InsurancePoliciesPagesState {
  const { items, ...pages } = useInfinitePages(useListInsurancePolicyPagesInfiniteQuery(args));
  return { ...pages, policies: items };
}
