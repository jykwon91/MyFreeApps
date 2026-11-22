import type { UtilityPlanListSort } from "./utility-plan-list-sort";
import type { UtilityServiceType } from "./utility-service-type";

export interface UtilityPlanPageArgs {
  service_type?: UtilityServiceType;
  /** True narrows the list to current plans whose term has lapsed or ends within the renewal window. */
  needs_renewal?: boolean;
  /** The server orders the whole list, so every page is cut from the same order. Newest term first when left out. */
  sort?: UtilityPlanListSort;
}
