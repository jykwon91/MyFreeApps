import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListUtilityPlanPagesInfiniteQuery } from "../store/utilityPlansApi";
import type { UtilityPlanPageArgs } from "../types/utility/utility-plan-page-args";
import type { UtilityPlansPagesState } from "../types/utility/utility-plans-pages-state";

/** GET /utility-plans a page at a time, narrowed by service and to plans that need renewing. */
export function useUtilityPlansPages(args: UtilityPlanPageArgs): UtilityPlansPagesState {
  const { items, ...pages } = useInfinitePages(useListUtilityPlanPagesInfiniteQuery(args));
  return { ...pages, plans: items };
}
