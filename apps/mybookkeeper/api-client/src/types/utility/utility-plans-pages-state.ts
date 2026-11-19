import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { UtilityPlanSummary } from "./utility-plan-summary";

/** A paged utility plans list, as a screen needs it: `plans` is every loaded row, in the server's order. */
export interface UtilityPlansPagesState extends Omit<InfinitePagesResult<UtilityPlanSummary>, "items"> {
  plans: UtilityPlanSummary[];
}
